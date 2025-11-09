from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
import logging
import os
import requests
from schemas import ItineraryGenerationRequest, GreenTripItineraryResponse
from services.itinerary_generator import generate_itinerary
from services.chat_planner import chat_planner
from services.profile_generator import generate_user_profile_summary
from services.preference_aggregator import promote_frequent_preferences
from services.supabase_client import get_supabase_client
from services.imessage_service import get_imessage_service, is_available
from photon_integration.routes import router as photon_router
from photon_integration.itinerary_cache import store_itinerary

logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Photon integration router
app.include_router(photon_router, prefix="/photon", tags=["photon"])


@app.get("/plan")
def read_root():
    return {"message": "TripSmith backend running!"}


@app.post("/generate_itinerary", response_model=GreenTripItineraryResponse)
async def generate_itinerary_endpoint(request: ItineraryGenerationRequest):
    """Generate a travel itinerary using Dedalus Labs"""
    result = await generate_itinerary(request)
    
    # Store in cache for Photon AI access
    # Use a default user_id if none provided, or extract from request if available
    user_id = getattr(request, 'user_id', None) or 'default'
    # Convert Pydantic model to dict (works with both v1 and v2)
    if hasattr(result, 'model_dump'):
        result_dict = result.model_dump()
    elif hasattr(result, 'dict'):
        result_dict = result.dict()
    else:
        result_dict = result
    store_itinerary(user_id, result_dict)
    
    return result


class ChatPlannerRequest(BaseModel):
    message: str
    itinerary: Dict[str, Any]
    user_id: Optional[str] = None
    trip_id: Optional[str] = None
    collaborator_id: Optional[str] = None  # For shared trips, combine preferences from both users


class ChatPlannerResponse(BaseModel):
    response: str
    updated_itinerary: Optional[Dict[str, Any]] = None
    extracted_preferences: Optional[List[Dict[str, Any]]] = None


class SaveUserPreferencesRequest(BaseModel):
    user_id: str
    preferences: List[str] = []
    likes: List[str] = []
    dislikes: List[str] = []
    dietary_restrictions: List[str] = []
    username: Optional[str] = None


@app.post("/chat_planner", response_model=ChatPlannerResponse)
async def chat_planner_endpoint(request: ChatPlannerRequest):
    """Chat with the travel planner to modify itinerary"""
    result = await chat_planner(
        request.message, 
        request.itinerary,
        user_id=request.user_id,
        trip_id=request.trip_id,
        collaborator_id=request.collaborator_id
    )
    return ChatPlannerResponse(
        response=result["response"],
        updated_itinerary=result.get("updated_itinerary"),
        extracted_preferences=result.get("extracted_preferences"),
    )


@app.get("/user/preferences")
async def get_user_preferences(user_id: str):
    """Get all user preferences (long-term + frequent trip-specific)"""
    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        # Get long-term preferences
        long_term = supabase.table("chat_preferences").select("*").eq(
            "user_id", user_id
        ).eq("preference_type", "long_term").execute()
        
        # Get frequent trip-specific preferences (frequency >= 3)
        frequent_trip = supabase.table("chat_preferences").select("*").eq(
            "user_id", user_id
        ).eq("preference_type", "trip_specific").gte("frequency", 3).execute()
        
        # Get temporal preferences (frequency >= 2)
        temporal = supabase.table("chat_preferences").select("*").eq(
            "user_id", user_id
        ).eq("preference_type", "temporal").gte("frequency", 2).execute()
        
        return {
            "long_term": long_term.data or [],
            "frequent_trip_specific": frequent_trip.data or [],
            "temporal": temporal.data or [],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching preferences: {str(e)}")


@app.get("/user/username/check")
async def check_username(username: str):
    """Check if username is available"""
    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        # Normalize username: trim whitespace and convert to lowercase for comparison
        normalized_username = username.strip().lower()
        
        if not normalized_username:
            return {"available": False, "message": "Username cannot be empty"}
        
        logger.info(f"Checking username availability for: '{username}' (normalized: '{normalized_username}')")
        
        # Check if username exists (case-insensitive, excluding NULL and empty strings)
        try:
            # Get all usernames and check case-insensitively
            # First try to get all non-null usernames
            result = supabase.table("user_preferences").select("user_id, username").execute()
            
            # Check if any existing username matches (case-insensitive)
            if result.data:
                for record in result.data:
                    existing_username_raw = record.get("username")
                    # Skip NULL or empty usernames
                    if not existing_username_raw or existing_username_raw.strip() == "":
                        continue
                    existing_username = existing_username_raw.strip().lower()
                    if existing_username == normalized_username:
                        logger.info(f"Username '{username}' is already taken by user {record.get('user_id')}")
                        return {"available": False, "message": "Username already taken"}
            
            logger.info(f"Username '{username}' is available")
            return {"available": True, "message": "Username available"}
        except Exception as db_error:
            # If column doesn't exist yet, assume username is available
            error_str = str(db_error)
            if "does not exist" in error_str or "42703" in error_str:
                logger.warning(f"Username column doesn't exist yet, assuming username is available: {username}")
                return {"available": True, "message": "Username available (column not created yet)"}
            else:
                logger.error(f"Database error checking username: {db_error}", exc_info=True)
                raise
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking username: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error checking username: {str(e)}")


@app.post("/user/preferences/save")
async def save_user_preferences(request: SaveUserPreferencesRequest):
    """Save user registration preferences (bypasses RLS using service role)"""
    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        # Normalize preferences to match exact values from preferenceOptions (case-sensitive matching)
        # Valid preference options (must match exactly)
        VALID_PREFERENCE_OPTIONS = [
            "Food", "Art", "Outdoors", "History", "Nightlife", "Wellness", "Shopping", "Adventure"
        ]
        VALID_DIETARY_OPTIONS = [
            "vegetarian", "vegan", "gluten-free", "dairy-free", "halal", "kosher", "pescatarian"
        ]
        
        def normalize_preference_list(prefs: List[str], valid_options: List[str] = None) -> List[str]:
            """Normalize and deduplicate preference list, matching to valid options exactly"""
            if not prefs:
                return []
            seen = set()
            normalized = []
            for pref in prefs:
                if not pref or not pref.strip():
                    continue
                pref_trimmed = pref.strip()
                
                # If valid_options provided, match case-insensitively but return exact value
                if valid_options:
                    matched_option = None
                    for option in valid_options:
                        if option.lower() == pref_trimmed.lower():
                            matched_option = option
                            break
                    if matched_option:
                        pref_trimmed = matched_option
                
                normalized_lower = pref_trimmed.lower()
                if normalized_lower not in seen:
                    seen.add(normalized_lower)
                    normalized.append(pref_trimmed)
            return normalized
        
        # Prepare data for upsert with normalized preferences
        # Match preferences to exact valid option values
        upsert_data = {
            "user_id": request.user_id,
            "preferences": normalize_preference_list(request.preferences, VALID_PREFERENCE_OPTIONS),
            "likes": normalize_preference_list(request.likes),  # Likes/dislikes are free-form
            "dislikes": normalize_preference_list(request.dislikes),  # Likes/dislikes are free-form
            "dietary_restrictions": normalize_preference_list(request.dietary_restrictions, VALID_DIETARY_OPTIONS),
            "updated_at": "now()",
        }
        
        logger.info(f"Normalized preferences for user {request.user_id}: preferences={upsert_data['preferences']}, likes={upsert_data['likes']}, dislikes={upsert_data['dislikes']}")
        
        # Add username if provided
        if request.username:
            # Normalize username for case-insensitive comparison
            normalized_username = request.username.strip().lower()
            
            # Check if username is already taken by another user (case-insensitive)
            try:
                # Get all usernames and check case-insensitively
                all_users = supabase.table("user_preferences").select("user_id, username").execute()
                
                if all_users.data:
                    for record in all_users.data:
                        # Skip if it's the same user
                        if record.get("user_id") == request.user_id:
                            continue
                        
                        existing_username_raw = record.get("username")
                        # Skip NULL or empty usernames
                        if not existing_username_raw or existing_username_raw.strip() == "":
                            continue
                        
                        existing_username = existing_username_raw.strip().lower()
                        if existing_username == normalized_username:
                            logger.warning(f"Username '{request.username}' is already taken by user {record.get('user_id')}")
                            raise HTTPException(status_code=400, detail="Username already taken")
            except Exception as db_error:
                # If column doesn't exist yet, skip the check but still try to save
                error_str = str(db_error)
                if "does not exist" in error_str or "42703" in error_str:
                    logger.warning(f"Username column doesn't exist yet, skipping duplicate check for: {request.username}")
                else:
                    raise
            
            upsert_data["username"] = request.username
        
        # Upsert user preferences - this ensures all users have a record
        result = supabase.table("user_preferences").upsert(
            upsert_data,
            on_conflict="user_id"
        ).execute()
        
        logger.info(f"Saved preferences for user {request.user_id} (username: {request.username or 'none'})")
        return {"message": "Preferences saved successfully", "data": result.data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving preferences: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error saving preferences: {str(e)}")


@app.get("/user/profile")
async def get_user_profile(user_id: str):
    """Get generated user profile summary"""
    try:
        logger.info(f"Profile endpoint called for user: {user_id}")
        
        # First check if we can connect to Supabase
        supabase = get_supabase_client()
        if not supabase:
            logger.error("Supabase client not available - cannot generate profile")
            raise HTTPException(
                status_code=503, 
                detail="Database service unavailable. Please check backend configuration (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables)."
            )
        
        # Check if user has preferences
        user_prefs_response = supabase.table("user_preferences").select("*").eq(
            "user_id", user_id
        ).execute()
        
        logger.info(f"User preferences check: {len(user_prefs_response.data or [])} records found")
        
        summary = await generate_user_profile_summary(user_id)
        logger.info(f"Profile summary generated: {summary[:100]}...")
        return {"summary": summary}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating profile: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error generating profile: {str(e)}")


class PromotePreferenceRequest(BaseModel):
    user_id: str
    preference_id: str


@app.post("/user/preferences/promote")
async def promote_preference(request: PromotePreferenceRequest):
    """Manually promote a trip-specific preference to long-term"""
    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        # Get the preference
        pref = supabase.table("chat_preferences").select("*").eq(
            "id", request.preference_id
        ).eq("user_id", request.user_id).execute()
        
        if not pref.data or len(pref.data) == 0:
            raise HTTPException(status_code=404, detail="Preference not found")
        
        pref_data = pref.data[0]
        
        if pref_data["preference_type"] != "trip_specific":
            raise HTTPException(status_code=400, detail="Can only promote trip-specific preferences")
        
        # Check if long-term version already exists
        existing = supabase.table("chat_preferences").select("*").eq(
            "user_id", request.user_id
        ).eq("preference_category", pref_data["preference_category"]).eq(
            "preference_value", pref_data["preference_value"]
        ).eq("preference_type", "long_term").execute()
        
        if existing.data and len(existing.data) > 0:
            return {"message": "Preference already promoted", "preference": existing.data[0]}
        
        # Create long-term version
        new_pref = {
            "user_id": request.user_id,
            "trip_id": None,
            "preference_type": "long_term",
            "preference_category": pref_data["preference_category"],
            "preference_value": pref_data["preference_value"],
            "frequency": pref_data["frequency"],
            "confidence": pref_data.get("confidence", 0.5),
            "extracted_from_message": f"Manually promoted from trip-specific",
        }
        
        result = supabase.table("chat_preferences").insert(new_pref).execute()
        
        return {"message": "Preference promoted successfully", "preference": new_pref}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error promoting preference: {str(e)}")


class DeleteAccountRequest(BaseModel):
    user_id: str


class AddFriendRequest(BaseModel):
    user_id: str
    friend_email: Optional[str] = None
    friend_username: Optional[str] = None


class AcceptFriendRequest(BaseModel):
    user_id: str
    friendship_id: str


class RemoveFriendRequest(BaseModel):
    user_id: str
    friend_id: str


class ShareTripRequest(BaseModel):
    trip_id: str
    owner_id: str
    friend_id: str
    can_edit: bool = True


class UnshareTripRequest(BaseModel):
    trip_id: str
    owner_id: str
    friend_id: str


@app.delete("/user/account")
async def delete_user_account(request: DeleteAccountRequest):
    """Delete a user account and all associated data"""
    try:
        user_id = request.user_id
        supabase = get_supabase_client()
        
        # Delete all user data first (CASCADE will handle this, but we'll do it explicitly)
        if supabase:
            # Delete saved trips
            try:
                supabase.table("saved_trips").delete().eq("user_id", user_id).execute()
            except Exception as e:
                logger.warning(f"Error deleting trips: {e}")
            
            # Delete user preferences
            try:
                supabase.table("user_preferences").delete().eq("user_id", user_id).execute()
            except Exception as e:
                logger.warning(f"Error deleting preferences: {e}")
            
            # Delete chat preferences
            try:
                supabase.table("chat_preferences").delete().eq("user_id", user_id).execute()
            except Exception as e:
                logger.warning(f"Error deleting chat preferences: {e}")
        else:
            logger.warning("Supabase client not available, skipping data deletion (will be handled by CASCADE)")
        
        # Delete the auth user (requires service role key)
        # Use Supabase REST API directly since Python client might not have admin methods
        try:
            supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
            service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            
            if not supabase_url or not service_role_key:
                raise HTTPException(status_code=500, detail="Supabase service role key not configured. Please add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to backend/.env")
            
            # Delete user via Supabase Admin API
            delete_url = f"{supabase_url}/auth/v1/admin/users/{user_id}"
            headers = {
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
                "Content-Type": "application/json"
            }
            
            response = requests.delete(delete_url, headers=headers)
            
            if response.status_code not in [200, 204]:
                error_text = response.text
                logger.error(f"Error deleting auth user: {response.status_code} - {error_text}")
                raise HTTPException(status_code=500, detail=f"Error deleting auth user: {error_text}")
            
            logger.info(f"Successfully deleted auth user: {user_id}")
                
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error deleting auth user: {e}")
            raise HTTPException(status_code=500, detail=f"Error deleting auth user: {str(e)}")
        
        return {"message": "Account deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting account: {str(e)}")


@app.post("/friends/add")
async def add_friend(request: AddFriendRequest):
    """Send a friend request by email or username"""
    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        if not request.friend_email and not request.friend_username:
            raise HTTPException(status_code=400, detail="Either email or username must be provided")
        
        supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url or not service_role_key:
            raise HTTPException(status_code=500, detail="Supabase service role key not configured")
        
        admin_url = f"{supabase_url}/auth/v1/admin/users"
        headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json"
        }
        
        friend_id = None
        
        # Try to find by username first
        if request.friend_username:
            logger.info(f"Looking up user by username: {request.friend_username}")
            try:
                username_result = supabase.table("user_preferences").select("user_id").eq(
                    "username", request.friend_username
                ).execute()
                
                logger.info(f"Username lookup result: {username_result.data}")
                if username_result.data and len(username_result.data) > 0:
                    friend_id = username_result.data[0]["user_id"]
                    logger.info(f"Found user by username: {friend_id}")
                else:
                    logger.warning(f"No user found with username: {request.friend_username}")
            except Exception as db_error:
                # If column doesn't exist yet, skip username lookup
                error_str = str(db_error)
                if "does not exist" in error_str or "42703" in error_str:
                    logger.warning(f"Username column doesn't exist yet, skipping username lookup")
                else:
                    raise
        
        # If not found by username, try email
        if not friend_id and request.friend_email:
            logger.info(f"Looking up user by email: {request.friend_email}")
            # Use REST API to search for user by email
            try:
                # Supabase admin API endpoint for listing users - we'll filter by email
                response = requests.get(f"{admin_url}", headers=headers)
                logger.info(f"Email lookup response status: {response.status_code}")
                if response.status_code == 200:
                    users_data = response.json()
                    logger.info(f"Email lookup response type: {type(users_data)}")
                    # Response is a dict with 'users' key
                    users_list = users_data.get("users", []) if isinstance(users_data, dict) else []
                    
                    logger.info(f"Found {len(users_list)} users in response")
                    # Search for user with matching email (case-insensitive)
                    search_email = request.friend_email.lower().strip()
                    for user in users_list:
                        if isinstance(user, dict):
                            user_email = user.get("email", "").lower().strip() if user.get("email") else ""
                            if user_email == search_email:
                                friend_id = user.get("id")
                                logger.info(f"Found user by email via REST API: {friend_id} ({user.get('email')})")
                                break
                    
                    if not friend_id:
                        logger.warning(f"No users found with email: {request.friend_email} (searched: {search_email})")
                else:
                    error_text = response.text
                    logger.warning(f"Failed to lookup user by email: {response.status_code} - {error_text}")
                    raise HTTPException(status_code=500, detail=f"Failed to lookup user: {error_text}")
            except HTTPException:
                raise
            except Exception as rest_error:
                logger.error(f"Error using REST API for email lookup: {rest_error}", exc_info=True)
                raise HTTPException(status_code=500, detail=f"Error looking up user by email: {str(rest_error)}")
        
        if not friend_id:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Check if already friends or request exists
        existing = supabase.table("friendships").select("*").or_(
            f"user_id.eq.{request.user_id},friend_id.eq.{request.user_id}"
        ).or_(
            f"user_id.eq.{friend_id},friend_id.eq.{friend_id}"
        ).execute()
        
        for friendship in existing.data:
            if (friendship["user_id"] == request.user_id and friendship["friend_id"] == friend_id) or \
               (friendship["user_id"] == friend_id and friendship["friend_id"] == request.user_id):
                if friendship["status"] == "accepted":
                    raise HTTPException(status_code=400, detail="Already friends")
                elif friendship["status"] == "pending":
                    raise HTTPException(status_code=400, detail="Friend request already sent")
                elif friendship["status"] == "blocked":
                    raise HTTPException(status_code=400, detail="Cannot add this user")
        
        # Create friend request
        logger.info(f"Creating friend request from {request.user_id} to {friend_id}")
        result = supabase.table("friendships").insert({
            "user_id": request.user_id,
            "friend_id": friend_id,
            "status": "pending"
        }).execute()
        
        logger.info(f"Friend request sent from {request.user_id} to {friend_id}, result: {result.data}")
        return {"message": "Friend request sent", "friendship": result.data[0] if result.data else None}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding friend: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error adding friend: {str(e)}")


@app.get("/friends/list")
async def get_friends(user_id: str):
    """Get list of friends (accepted friendships)"""
    try:
        logger.info(f"Getting friends for user: {user_id}")
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        # Get all accepted friendships where user is involved
        friendships = supabase.table("friendships").select("*").or_(
            f"user_id.eq.{user_id},friend_id.eq.{user_id}"
        ).eq("status", "accepted").execute()
        
        logger.info(f"Found {len(friendships.data or [])} accepted friendships for user {user_id}")
        
        friends = []
        supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if supabase_url and service_role_key:
            admin_url = f"{supabase_url}/auth/v1/admin/users"
            headers = {
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
            }
            
            for friendship in friendships.data or []:
                other_user_id = friendship["friend_id"] if friendship["user_id"] == user_id else friendship["user_id"]
                try:
                    # Get username from user_preferences
                    username_result = supabase.table("user_preferences").select("username").eq(
                        "user_id", other_user_id
                    ).execute()
                    username = username_result.data[0].get("username", "") if username_result.data and len(username_result.data) > 0 else ""
                    
                    # Get email from auth API
                    response = requests.get(f"{admin_url}/{other_user_id}", headers=headers)
                    email = ""
                    if response.status_code == 200:
                        friend_user = response.json()
                        email = friend_user.get("email", "")
                    
                    friend_data = {
                        "friendship_id": friendship["id"],
                        "friend_id": other_user_id,
                        "username": username,
                        "email": email,
                        "created_at": friendship["created_at"]
                    }
                    friends.append(friend_data)
                    logger.info(f"Added friend: {friend_data}")
                except Exception as e:
                    logger.warning(f"Error fetching friend user {other_user_id}: {e}", exc_info=True)
        else:
            logger.warning("Supabase URL or service role key not configured, returning empty friends list")
        
        logger.info(f"Returning {len(friends)} friends for user {user_id}")
        return {"friends": friends}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting friends: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error getting friends: {str(e)}")


@app.get("/friends/pending")
async def get_pending_requests(user_id: str):
    """Get pending friend requests (received)"""
    try:
        logger.info(f"Getting pending requests for user: {user_id}")
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        # Get pending requests where user is the friend (receiver)
        try:
            logger.info(f"Querying friendships table for friend_id={user_id}, status=pending")
            friendships = supabase.table("friendships").select("*").eq(
                "friend_id", user_id
            ).eq("status", "pending").execute()
            
            logger.info(f"Query result: {friendships}")
            logger.info(f"Query data: {friendships.data}")
            logger.info(f"Found {len(friendships.data or [])} pending friendships for user {user_id}")
        except Exception as query_error:
            logger.error(f"Error querying friendships table: {query_error}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Error querying friendships: {str(query_error)}")
        
        requests = []
        supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url or not service_role_key:
            logger.warning("Supabase URL or service role key not configured")
            # Return empty list if we can't fetch user emails, but still return the friendship IDs
            if friendships.data:
                for friendship in friendships.data:
                    requests.append({
                        "friendship_id": friendship["id"],
                        "requester_id": friendship["user_id"],
                        "email": f"user_{friendship['user_id'][:8]}",
                        "created_at": friendship["created_at"]
                    })
        else:
            admin_url = f"{supabase_url}/auth/v1/admin/users"
            headers = {
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
            }
            
            for friendship in friendships.data or []:
                try:
                    logger.info(f"Fetching requester info for user_id: {friendship['user_id']}")
                    
                    # Get username from user_preferences
                    username_result = supabase.table("user_preferences").select("username").eq(
                        "user_id", friendship["user_id"]
                    ).execute()
                    username = username_result.data[0].get("username", "") if username_result.data and len(username_result.data) > 0 else ""
                    
                    # Get email from auth API
                    response = requests.get(f"{admin_url}/{friendship['user_id']}", headers=headers)
                    logger.info(f"Admin API response status: {response.status_code}")
                    email = ""
                    if response.status_code == 200:
                        requester_data = response.json()
                        logger.info(f"Requester data: {requester_data}")
                        # The response might be wrapped in a 'user' key or be the user object directly
                        if isinstance(requester_data, dict):
                            if 'user' in requester_data:
                                requester = requester_data['user']
                            elif 'email' in requester_data:
                                requester = requester_data
                            else:
                                requester = requester_data
                        else:
                            requester = requester_data
                        
                        email = requester.get("email", "") if isinstance(requester, dict) else ""
                    
                    requests.append({
                        "friendship_id": friendship["id"],
                        "requester_id": friendship["user_id"],
                        "username": username,
                        "email": email or f"user_{friendship['user_id'][:8]}",
                        "created_at": friendship["created_at"]
                    })
                    logger.info(f"Added pending request: {username or email or 'no identifier'}")
                except Exception as e:
                    logger.warning(f"Error fetching requester {friendship['user_id']}: {e}", exc_info=True)
                    # Still add the request without email/username
                    requests.append({
                        "friendship_id": friendship["id"],
                        "requester_id": friendship["user_id"],
                        "username": "",
                        "email": f"user_{friendship['user_id'][:8]}",
                        "created_at": friendship["created_at"]
                    })
        
        logger.info(f"Returning {len(requests)} pending requests")
        return {"pending_requests": requests}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting pending requests: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error getting pending requests: {str(e)}")


@app.get("/friends/sent")
async def get_sent_requests(user_id: str):
    """Get pending friend requests that the user sent"""
    try:
        logger.info(f"Getting sent requests for user: {user_id}")
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        # Get pending requests where user is the sender
        # Use service role key to bypass RLS
        try:
            logger.info(f"Querying friendships table for user_id={user_id}, status=pending")
            friendships = supabase.table("friendships").select("*").eq(
                "user_id", user_id
            ).eq("status", "pending").execute()
            
            logger.info(f"Query result: {friendships}")
            logger.info(f"Query data: {friendships.data}")
            logger.info(f"Found {len(friendships.data or [])} pending friendships for user {user_id}")
        except Exception as query_error:
            logger.error(f"Error querying friendships table: {query_error}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Error querying friendships: {str(query_error)}")
        
        requests = []
        supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url or not service_role_key:
            logger.warning("Supabase URL or service role key not configured")
            # Return empty list if we can't fetch user emails, but still return the friendship IDs
            if friendships.data:
                for friendship in friendships.data:
                    # Try to get username even without service key
                    try:
                        username_result = supabase.table("user_preferences").select("username").eq(
                            "user_id", friendship["friend_id"]
                        ).execute()
                        username = username_result.data[0].get("username", "") if username_result.data and len(username_result.data) > 0 else ""
                    except:
                        username = ""
                    
                    requests.append({
                        "friendship_id": friendship["id"],
                        "recipient_id": friendship["friend_id"],
                        "username": username,
                        "email": f"user_{friendship['friend_id'][:8]}",
                        "created_at": friendship["created_at"]
                    })
        else:
            admin_url = f"{supabase_url}/auth/v1/admin/users"
            headers = {
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
            }
            
            for friendship in friendships.data or []:
                try:
                    logger.info(f"Fetching recipient info for friend_id: {friendship['friend_id']}")
                    
                    # Get username from user_preferences
                    username_result = supabase.table("user_preferences").select("username").eq(
                        "user_id", friendship["friend_id"]
                    ).execute()
                    username = username_result.data[0].get("username", "") if username_result.data and len(username_result.data) > 0 else ""
                    
                    # Get email from auth API
                    response = requests.get(f"{admin_url}/{friendship['friend_id']}", headers=headers)
                    logger.info(f"Admin API response status: {response.status_code}")
                    email = ""
                    if response.status_code == 200:
                        recipient_data = response.json()
                        logger.info(f"Recipient data: {recipient_data}")
                        # The response might be wrapped in a 'user' key or be the user object directly
                        if isinstance(recipient_data, dict):
                            if 'user' in recipient_data:
                                recipient = recipient_data['user']
                            elif 'email' in recipient_data:
                                recipient = recipient_data
                            else:
                                recipient = recipient_data
                        else:
                            recipient = recipient_data
                        
                        email = recipient.get("email", "") if isinstance(recipient, dict) else ""
                    
                    requests.append({
                        "friendship_id": friendship["id"],
                        "recipient_id": friendship["friend_id"],
                        "username": username,
                        "email": email or f"user_{friendship['friend_id'][:8]}",
                        "created_at": friendship["created_at"]
                    })
                    logger.info(f"Added sent request: {username or email or 'no identifier'}")
                except Exception as e:
                    logger.warning(f"Error fetching recipient {friendship['friend_id']}: {e}", exc_info=True)
                    # Still add the request without email/username
                    requests.append({
                        "friendship_id": friendship["id"],
                        "recipient_id": friendship["friend_id"],
                        "username": "",
                        "email": f"user_{friendship['friend_id'][:8]}",
                        "created_at": friendship["created_at"]
                    })
        
        logger.info(f"Returning {len(requests)} sent requests")
        return {"sent_requests": requests}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting sent requests: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error getting sent requests: {str(e)}")


@app.post("/trips/share")
async def share_trip(request: ShareTripRequest):
    """Share a trip with a friend"""
    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        # Verify the user owns the trip
        trip_result = supabase.table("saved_trips").select("user_id").eq("id", request.trip_id).execute()
        if not trip_result.data or len(trip_result.data) == 0:
            raise HTTPException(status_code=404, detail="Trip not found")
        
        if trip_result.data[0]["user_id"] != request.owner_id:
            raise HTTPException(status_code=403, detail="You can only share trips you own")
        
        # Verify they are friends
        friendship_result = supabase.table("friendships").select("*").or_(
            f"user_id.eq.{request.owner_id},friend_id.eq.{request.owner_id}"
        ).or_(
            f"user_id.eq.{request.friend_id},friend_id.eq.{request.friend_id}"
        ).eq("status", "accepted").execute()
        
        are_friends = False
        for friendship in friendship_result.data or []:
            if (friendship["user_id"] == request.owner_id and friendship["friend_id"] == request.friend_id) or \
               (friendship["user_id"] == request.friend_id and friendship["friend_id"] == request.owner_id):
                are_friends = True
                break
        
        if not are_friends:
            raise HTTPException(status_code=400, detail="You can only share trips with friends")
        
        # Check if already shared
        existing = supabase.table("trip_shares").select("*").eq("trip_id", request.trip_id).eq(
            "shared_with_id", request.friend_id
        ).execute()
        
        if existing.data and len(existing.data) > 0:
            raise HTTPException(status_code=400, detail="Trip already shared with this friend")
        
        # Create share
        result = supabase.table("trip_shares").insert({
            "trip_id": request.trip_id,
            "owner_id": request.owner_id,
            "shared_with_id": request.friend_id,
            "can_edit": request.can_edit,
        }).execute()
        
        logger.info(f"Trip {request.trip_id} shared with {request.friend_id} by {request.owner_id}")
        return {"message": "Trip shared successfully", "share": result.data[0] if result.data else None}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sharing trip: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error sharing trip: {str(e)}")


@app.post("/trips/unshare")
async def unshare_trip(request: UnshareTripRequest):
    """Unshare a trip with a friend"""
    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        # Verify the user owns the trip or is the one it's shared with
        trip_result = supabase.table("saved_trips").select("user_id").eq("id", request.trip_id).execute()
        if not trip_result.data or len(trip_result.data) == 0:
            raise HTTPException(status_code=404, detail="Trip not found")
        
        # Check if user is owner or shared with
        share_result = supabase.table("trip_shares").select("*").eq("trip_id", request.trip_id).eq(
            "shared_with_id", request.friend_id
        ).execute()
        
        if not share_result.data or len(share_result.data) == 0:
            raise HTTPException(status_code=404, detail="Trip share not found")
        
        share = share_result.data[0]
        if share["owner_id"] != request.owner_id and share["shared_with_id"] != request.owner_id:
            raise HTTPException(status_code=403, detail="You can only unshare trips you own or that are shared with you")
        
        # Delete the share
        supabase.table("trip_shares").delete().eq("trip_id", request.trip_id).eq(
            "shared_with_id", request.friend_id
        ).execute()
        
        logger.info(f"Trip {request.trip_id} unshared with {request.friend_id} by {request.owner_id}")
        return {"message": "Trip unshared successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unsharing trip: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error unsharing trip: {str(e)}")


@app.get("/trips/shared")
async def get_shared_trips(user_id: str):
    """Get trips shared with the user"""
    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        # Get trips shared with this user
        shares_result = supabase.table("trip_shares").select("*, saved_trips(*)").eq(
            "shared_with_id", user_id
        ).execute()
        
        shared_trips = []
        for share in shares_result.data or []:
            if share.get("saved_trips"):
                trip = share["saved_trips"]
                # Get owner username
                owner_username = ""
                try:
                    owner_prefs = supabase.table("user_preferences").select("username").eq(
                        "user_id", share["owner_id"]
                    ).execute()
                    if owner_prefs.data and len(owner_prefs.data) > 0:
                        owner_username = owner_prefs.data[0].get("username", "")
                except:
                    pass
                
                shared_trips.append({
                    "trip_id": trip["id"],
                    "trip_name": trip["trip_name"],
                    "destination": trip["destination"],
                    "start_date": trip.get("start_date"),
                    "end_date": trip.get("end_date"),
                    "num_days": trip.get("num_days"),
                    "budget": trip.get("budget"),
                    "mode": trip.get("mode"),
                    "itinerary_data": trip.get("itinerary_data"),
                    "created_at": trip.get("created_at"),
                    "updated_at": trip.get("updated_at"),
                    "owner_id": share["owner_id"],
                    "owner_username": owner_username,
                    "can_edit": share.get("can_edit", True),
                    "share_id": share["id"],
                })
        
        return {"shared_trips": shared_trips}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting shared trips: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error getting shared trips: {str(e)}")


@app.get("/trips/shared-by")
async def get_trips_shared_by_user(user_id: str):
    """Get trips shared by the user (trips they own and shared)"""
    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        # Get trips shared by this user
        shares_result = supabase.table("trip_shares").select("*, saved_trips(*)").eq(
            "owner_id", user_id
        ).execute()
        
        shared_trips = []
        for share in shares_result.data or []:
            if share.get("saved_trips"):
                trip = share["saved_trips"]
                # Get friend username
                friend_username = ""
                try:
                    friend_prefs = supabase.table("user_preferences").select("username").eq(
                        "user_id", share["shared_with_id"]
                    ).execute()
                    if friend_prefs.data and len(friend_prefs.data) > 0:
                        friend_username = friend_prefs.data[0].get("username", "")
                except:
                    pass
                
                shared_trips.append({
                    "trip_id": trip["id"],
                    "trip_name": trip["trip_name"],
                    "destination": trip["destination"],
                    "shared_with_id": share["shared_with_id"],
                    "friend_username": friend_username,
                    "can_edit": share.get("can_edit", True),
                    "share_id": share["id"],
                    "created_at": share.get("created_at"),
                })
        
        return {"shared_trips": shared_trips}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting trips shared by user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error getting trips shared by user: {str(e)}")


@app.put("/trips/shared/update")
async def update_shared_trip(trip_id: str, user_id: str, itinerary_data: Dict[str, Any]):
    """Update a shared trip (only if user has edit permission)"""
    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        # Check if user owns the trip or has edit permission
        trip_result = supabase.table("saved_trips").select("user_id").eq("id", trip_id).execute()
        if not trip_result.data or len(trip_result.data) == 0:
            raise HTTPException(status_code=404, detail="Trip not found")
        
        trip_owner = trip_result.data[0]["user_id"]
        
        # If user is owner, allow update
        if trip_owner == user_id:
            result = supabase.table("saved_trips").update({
                "itinerary_data": itinerary_data,
                "updated_at": "now()",
            }).eq("id", trip_id).execute()
            return {"message": "Trip updated successfully", "trip": result.data[0] if result.data else None}
        
        # Check if trip is shared with user and they have edit permission
        share_result = supabase.table("trip_shares").select("*").eq("trip_id", trip_id).eq(
            "shared_with_id", user_id
        ).execute()
        
        if not share_result.data or len(share_result.data) == 0:
            raise HTTPException(status_code=403, detail="You don't have permission to edit this trip")
        
        share = share_result.data[0]
        if not share.get("can_edit", True):
            raise HTTPException(status_code=403, detail="You don't have edit permission for this trip")
        
        # Update the trip
        result = supabase.table("saved_trips").update({
            "itinerary_data": itinerary_data,
            "updated_at": "now()",
        }).eq("id", trip_id).execute()
        
        logger.info(f"Shared trip {trip_id} updated by {user_id}")
        return {"message": "Trip updated successfully", "trip": result.data[0] if result.data else None}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating shared trip: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error updating shared trip: {str(e)}")


@app.post("/friends/accept")
async def accept_friend_request(request: AcceptFriendRequest):
    """Accept a friend request"""
    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        # Update friendship status to accepted
        result = supabase.table("friendships").update({
            "status": "accepted"
        }).eq("id", request.friendship_id).eq("friend_id", request.user_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Friend request not found")
        
        logger.info(f"Friend request {request.friendship_id} accepted by {request.user_id}")
        return {"message": "Friend request accepted", "friendship": result.data[0]}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error accepting friend request: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error accepting friend request: {str(e)}")


@app.post("/friends/remove")
async def remove_friend(request: RemoveFriendRequest):
    """Remove a friend (delete friendship)"""
    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        # Delete friendship (either direction)
        result = supabase.table("friendships").delete().or_(
            f"user_id.eq.{request.user_id},friend_id.eq.{request.user_id}"
        ).or_(
            f"user_id.eq.{request.friend_id},friend_id.eq.{request.friend_id}"
        ).execute()
        
        logger.info(f"Friendship removed between {request.user_id} and {request.friend_id}")
        return {"message": "Friend removed successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing friend: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error removing friend: {str(e)}")


# ==================== iMessage Integration Endpoints ====================

class IMessageSendRequest(BaseModel):
    to: str  # Phone number or email
    message: str


class IMessageTripNotificationRequest(BaseModel):
    to: str
    destination: str
    start_date: str
    end_date: str
    budget: float
    num_days: int
    trip_id: Optional[str] = None


class IMessageItineraryRequest(BaseModel):
    to: str
    itinerary: Dict[str, Any]


@app.get("/imessage/status")
async def imessage_status():
    """Check if iMessage service is available"""
    return {
        "available": is_available(),
        "platform": "macOS only",
        "note": "iMessage integration requires macOS and access to Messages database"
    }


@app.post("/imessage/send")
async def send_imessage(request: IMessageSendRequest):
    """Send a text message via iMessage"""
    if not is_available():
        raise HTTPException(
            status_code=503,
            detail="iMessage service not available. This feature requires macOS."
        )
    
    try:
        service = get_imessage_service()
        result = service.send_text(request.to, request.message)
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to send message"))
        
        return {"message": "Message sent successfully", "result": result}
    except Exception as e:
        logger.error(f"Error sending iMessage: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error sending message: {str(e)}")


@app.post("/imessage/send-trip-notification")
async def send_trip_notification(request: IMessageTripNotificationRequest):
    """Send a trip notification via iMessage"""
    if not is_available():
        raise HTTPException(
            status_code=503,
            detail="iMessage service not available. This feature requires macOS."
        )
    
    try:
        service = get_imessage_service()
        trip_data = {
            "destination": request.destination,
            "startDate": request.start_date,
            "endDate": request.end_date,
            "budget": request.budget,
            "numDays": request.num_days,
            "tripId": request.trip_id
        }
        
        result = service.send_trip_notification(request.to, trip_data)
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to send notification"))
        
        return {"message": "Trip notification sent successfully", "result": result}
    except Exception as e:
        logger.error(f"Error sending trip notification: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error sending notification: {str(e)}")


@app.post("/imessage/send-itinerary")
async def send_itinerary(request: IMessageItineraryRequest):
    """Send itinerary details via iMessage"""
    if not is_available():
        raise HTTPException(
            status_code=503,
            detail="iMessage service not available. This feature requires macOS."
        )
    
    try:
        service = get_imessage_service()
        result = service.send_itinerary(request.to, request.itinerary)
        
        if not result.get("success"):
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to send itinerary"))
        
        return {"message": "Itinerary sent successfully", "result": result}
    except Exception as e:
        logger.error(f"Error sending itinerary: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error sending itinerary: {str(e)}")


# ==================== Trip Status and Carbon Tracking Endpoints ====================

class UpdateTripStatusRequest(BaseModel):
    trip_id: str
    user_id: str
    status: str  # 'draft', 'before', 'during', or 'after'
    selected_flight_id: Optional[str] = None
    selected_flight_data: Optional[Dict[str, Any]] = None
    carbon_emissions_kg: Optional[float] = None
    carbon_credits: Optional[float] = None


@app.put("/trips/status")
async def update_trip_status(request: UpdateTripStatusRequest):
    """Update trip status (before, during, after) and store carbon data"""
    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        # Validate status
        if request.status not in ['draft', 'before', 'during', 'after']:
            raise HTTPException(status_code=400, detail="Invalid status. Must be 'draft', 'before', 'during', or 'after'")
        
        # Check if user owns the trip
        trip_result = supabase.table("saved_trips").select("user_id").eq("id", request.trip_id).execute()
        if not trip_result.data or len(trip_result.data) == 0:
            raise HTTPException(status_code=404, detail="Trip not found")
        
        trip_owner = trip_result.data[0]["user_id"]
        if trip_owner != request.user_id:
            raise HTTPException(status_code=403, detail="You don't have permission to update this trip")
        
        # For 'during' and 'after' status, require flight selection
        if request.status in ['during', 'after']:
            if not request.selected_flight_id or not request.selected_flight_data:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Flight selection is required for '{request.status}' status"
                )
        
        # Prepare update data
        update_data = {
            "trip_status": request.status,
            "updated_at": "now()",
        }
        
        if request.selected_flight_id:
            update_data["selected_flight_id"] = request.selected_flight_id
        if request.selected_flight_data:
            update_data["selected_flight_data"] = request.selected_flight_data
        if request.carbon_emissions_kg is not None:
            update_data["carbon_emissions_kg"] = request.carbon_emissions_kg
        if request.carbon_credits is not None:
            update_data["carbon_credits"] = request.carbon_credits
        
        # Update the trip
        result = supabase.table("saved_trips").update(update_data).eq("id", request.trip_id).execute()
        
        logger.info(f"Trip {request.trip_id} status updated to {request.status} by {request.user_id}")
        return {"message": "Trip status updated successfully", "trip": result.data[0] if result.data else None}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating trip status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error updating trip status: {str(e)}")


@app.get("/trips/carbon-stats")
async def get_carbon_stats(user_id: str):
    """Get carbon statistics for a user (trips count, total emissions, total credits)"""
    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        # Get all trips with status 'after' (completed trips)
        trips_result = supabase.table("saved_trips").select(
            "id, carbon_emissions_kg, carbon_credits"
        ).eq("user_id", user_id).eq("trip_status", "after").execute()
        
        trips = trips_result.data or []
        trips_count = len(trips)
        total_emissions = sum(float(t.get("carbon_emissions_kg") or 0) for t in trips)
        total_credits = sum(float(t.get("carbon_credits") or 0) for t in trips)
        
        return {
            "trips_count": trips_count,
            "total_emissions_kg": round(total_emissions, 2),
            "total_credits": round(total_credits, 2),
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting carbon stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error getting carbon stats: {str(e)}")


@app.get("/trips/carbon-ranking")
async def get_carbon_ranking(user_id: str):
    """Get carbon credits ranking among friends"""
    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        # Get user's friends
        friends_result = supabase.table("friendships").select("user_id, friend_id").or_(
            f"user_id.eq.{user_id},friend_id.eq.{user_id}"
        ).eq("status", "accepted").execute()
        
        friend_ids = set([user_id])  # Include self
        for friendship in friends_result.data or []:
            if friendship["user_id"] == user_id:
                friend_ids.add(friendship["friend_id"])
            else:
                friend_ids.add(friendship["user_id"])
        
        # Get carbon stats for all friends
        ranking = []
        for friend_id in friend_ids:
            # Get user info
            user_prefs = supabase.table("user_preferences").select("username, email").eq(
                "user_id", friend_id
            ).execute()
            
            username = None
            if user_prefs.data and len(user_prefs.data) > 0:
                username = user_prefs.data[0].get("username")
                if not username:
                    # Use email as fallback
                    email = user_prefs.data[0].get("email", "")
                    username = email.split("@")[0] if email else f"user_{friend_id[:8]}"
            else:
                username = f"user_{friend_id[:8]}"
            
            # Get carbon stats
            trips_result = supabase.table("saved_trips").select(
                "id, carbon_emissions_kg, carbon_credits"
            ).eq("user_id", friend_id).eq("trip_status", "after").execute()
            
            trips = trips_result.data or []
            total_credits = sum(float(t.get("carbon_credits") or 0) for t in trips)
            total_emissions = sum(float(t.get("carbon_emissions_kg") or 0) for t in trips)
            trips_count = len(trips)
            
            ranking.append({
                "user_id": friend_id,
                "username": username,
                "trips_count": trips_count,
                "total_credits": round(total_credits, 2),
                "total_emissions_kg": round(total_emissions, 2),
            })
        
        # Sort by total credits (descending)
        ranking.sort(key=lambda x: x["total_credits"], reverse=True)
        
        # Add rank
        for i, entry in enumerate(ranking):
            entry["rank"] = i + 1
        
        return {"ranking": ranking}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting carbon ranking: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error getting carbon ranking: {str(e)}")

