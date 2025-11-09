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

logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/plan")
def read_root():
    return {"message": "TripSmith backend running!"}


@app.post("/generate_itinerary", response_model=GreenTripItineraryResponse)
async def generate_itinerary_endpoint(request: ItineraryGenerationRequest):
    """Generate a travel itinerary using Dedalus Labs"""
    return await generate_itinerary(request)


class ChatPlannerRequest(BaseModel):
    message: str
    itinerary: Dict[str, Any]
    user_id: Optional[str] = None
    trip_id: Optional[str] = None


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


@app.post("/chat_planner", response_model=ChatPlannerResponse)
async def chat_planner_endpoint(request: ChatPlannerRequest):
    """Chat with the travel planner to modify itinerary"""
    result = await chat_planner(
        request.message, 
        request.itinerary,
        user_id=request.user_id,
        trip_id=request.trip_id
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


@app.post("/user/preferences/save")
async def save_user_preferences(request: SaveUserPreferencesRequest):
    """Save user registration preferences (bypasses RLS using service role)"""
    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        # Upsert user preferences
        result = supabase.table("user_preferences").upsert({
            "user_id": request.user_id,
            "preferences": request.preferences,
            "likes": request.likes,
            "dislikes": request.dislikes,
            "dietary_restrictions": request.dietary_restrictions,
            "updated_at": "now()",
        }, on_conflict="user_id").execute()
        
        logger.info(f"Saved preferences for user {request.user_id}")
        return {"message": "Preferences saved successfully", "data": result.data}
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
    friend_email: str


class AcceptFriendRequest(BaseModel):
    user_id: str
    friendship_id: str


class RemoveFriendRequest(BaseModel):
    user_id: str
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
    """Send a friend request by email"""
    try:
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        # Find user by email
        supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if not supabase_url or not service_role_key:
            raise HTTPException(status_code=500, detail="Supabase service role key not configured")
        
        # Get user by email using admin API
        admin_url = f"{supabase_url}/auth/v1/admin/users"
        headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json"
        }
        
        response = requests.get(f"{admin_url}?email={request.friend_email}", headers=headers)
        if response.status_code != 200:
            raise HTTPException(status_code=404, detail="User not found")
        
        users = response.json()
        if not users or len(users.get("users", [])) == 0:
            raise HTTPException(status_code=404, detail="User not found")
        
        friend_user = users["users"][0]
        friend_id = friend_user["id"]
        
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
        result = supabase.table("friendships").insert({
            "user_id": request.user_id,
            "friend_id": friend_id,
            "status": "pending"
        }).execute()
        
        logger.info(f"Friend request sent from {request.user_id} to {friend_id}")
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
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        # Get all accepted friendships where user is involved
        friendships = supabase.table("friendships").select("*").or_(
            f"user_id.eq.{user_id},friend_id.eq.{user_id}"
        ).eq("status", "accepted").execute()
        
        friends = []
        supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if supabase_url and service_role_key:
            admin_url = f"{supabase_url}/auth/v1/admin/users"
            headers = {
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
            }
            
            for friendship in friendships.data:
                other_user_id = friendship["friend_id"] if friendship["user_id"] == user_id else friendship["user_id"]
                try:
                    response = requests.get(f"{admin_url}/{other_user_id}", headers=headers)
                    if response.status_code == 200:
                        friend_user = response.json()
                        friends.append({
                            "friendship_id": friendship["id"],
                            "friend_id": other_user_id,
                            "email": friend_user.get("email", ""),
                            "created_at": friendship["created_at"]
                        })
                except Exception as e:
                    logger.warning(f"Error fetching friend user {other_user_id}: {e}")
        
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
        supabase = get_supabase_client()
        if not supabase:
            raise HTTPException(status_code=503, detail="Database service unavailable")
        
        # Get pending requests where user is the friend (receiver)
        friendships = supabase.table("friendships").select("*").eq(
            "friend_id", user_id
        ).eq("status", "pending").execute()
        
        requests = []
        supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        
        if supabase_url and service_role_key:
            admin_url = f"{supabase_url}/auth/v1/admin/users"
            headers = {
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
            }
            
            for friendship in friendships.data:
                try:
                    response = requests.get(f"{admin_url}/{friendship['user_id']}", headers=headers)
                    if response.status_code == 200:
                        requester = response.json()
                        requests.append({
                            "friendship_id": friendship["id"],
                            "requester_id": friendship["user_id"],
                            "email": requester.get("email", ""),
                            "created_at": friendship["created_at"]
                        })
                except Exception as e:
                    logger.warning(f"Error fetching requester {friendship['user_id']}: {e}")
        
        return {"pending_requests": requests}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting pending requests: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error getting pending requests: {str(e)}")


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

