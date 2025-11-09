#!/usr/bin/env python3
"""
Script to generate 6 random user profiles in Supabase with default carbon emissions
"""
import os
import sys
import random
import requests
import json
from datetime import date, timedelta
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

# Sample names and data
FIRST_NAMES = ["Alex", "Jordan", "Sam", "Taylor", "Casey", "Morgan", "Riley", "Quinn", "Avery", "Blake"]
LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez"]
DOMAINS = ["example.com", "test.com", "demo.com"]

PREFERENCES_OPTIONS = ["food", "art", "outdoors", "history", "nightlife", "wellness", "shopping", "adventure"]
LIKES_OPTIONS = ["museums", "hiking", "beaches", "local cuisine", "photography", "architecture", "music", "sports"]
DISLIKES_OPTIONS = ["crowds", "nightlife", "fast food", "tourist traps", "shopping malls"]
DIETARY_OPTIONS = ["vegetarian", "vegan", "gluten-free", "dairy-free", "halal", "kosher", "pescatarian"]

DESTINATIONS = ["Tokyo", "Paris", "New York", "London", "Barcelona", "Bali", "Sydney", "Dubai", "Rome", "Bangkok"]

def generate_test_users():
    """Generate 6 random user profiles with carbon emissions"""
    supabase_url = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
    service_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    if not supabase_url or not service_key:
        print('❌ Missing Supabase credentials')
        print('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file')
        return False
    
    try:
        # Create admin client
        admin_client = create_client(supabase_url, service_key)
        
        print('Generating 6 random user profiles...\n')
        
        created_users = []
        
        for i in range(6):
            # Generate random user data
            first_name = random.choice(FIRST_NAMES)
            last_name = random.choice(LAST_NAMES)
            username = f"{first_name.lower()}{last_name.lower()}{random.randint(100, 999)}"
            email = f"{username}@{random.choice(DOMAINS)}"
            password = "TestPassword123!"  # Default password for test users
            
            # Generate random preferences
            num_prefs = random.randint(2, 5)
            preferences = random.sample(PREFERENCES_OPTIONS, num_prefs)
            
            num_likes = random.randint(2, 4)
            likes = random.sample(LIKES_OPTIONS, num_likes)
            
            num_dislikes = random.randint(1, 3)
            dislikes = random.sample(DISLIKES_OPTIONS, num_dislikes)
            
            has_dietary = random.choice([True, False])
            dietary_restrictions = random.sample(DIETARY_OPTIONS, random.randint(1, 2)) if has_dietary else []
            
            # Generate random carbon emission (2500 to 15000)
            carbon_emissions = round(random.uniform(2500, 15000), 2)
            
            print(f"Creating user {i+1}/6:")
            print(f"  Name: {first_name} {last_name}")
            print(f"  Username: {username}")
            print(f"  Email: {email}")
            print(f"  Carbon Emissions: {carbon_emissions} kg CO₂")
            print(f"  Preferences: {', '.join(preferences)}")
            
            # Create auth user
            try:
                # Use Supabase Admin API to create user
                create_user_url = f"{supabase_url}/auth/v1/admin/users"
                headers = {
                    "apikey": service_key,
                    "Authorization": f"Bearer {service_key}",
                    "Content-Type": "application/json"
                }
                
                user_data = {
                    "email": email,
                    "password": password,
                    "email_confirm": True,  # Auto-confirm email
                    "user_metadata": {
                        "first_name": first_name,
                        "last_name": last_name,
                        "username": username
                    }
                }
                
                response = requests.post(create_user_url, headers=headers, json=user_data)
                
                if response.status_code not in [200, 201]:
                    error_text = response.text
                    print(f"  ❌ Error creating auth user: {response.status_code} - {error_text}")
                    continue
                
                user_response = response.json()
                user_id = user_response.get("id")
                
                if not user_id:
                    print(f"  ❌ No user ID returned from auth creation")
                    continue
                
                print(f"  ✅ Created auth user: {user_id}")
                
            except Exception as e:
                print(f"  ❌ Error creating auth user: {e}")
                continue
            
            # Create user_preferences entry
            try:
                preferences_data = {
                    "user_id": user_id,
                    "username": username,
                    "preferences": preferences,
                    "likes": likes,
                    "dislikes": dislikes,
                    "dietary_restrictions": dietary_restrictions
                }
                
                result = admin_client.table("user_preferences").upsert(preferences_data).execute()
                print(f"  ✅ Created user preferences")
                
            except Exception as e:
                print(f"  ❌ Error creating user preferences: {e}")
            
            created_users.append({
                "user_id": user_id,
                "email": email,
                "username": username,
                "password": password,
                "carbon_emissions": carbon_emissions
            })
            
            print()
        
        # Sort users by carbon emissions (highest first) to assign trip counts
        created_users.sort(key=lambda x: x["carbon_emissions"], reverse=True)
        
        # Create trips for each user - higher emissions = more trips (1-5)
        print("=" * 60)
        print("Creating completed trips for users...")
        print("=" * 60)
        
        for idx, user in enumerate(created_users):
            user_id = user["user_id"]
            username = user["username"]
            total_emissions = user["carbon_emissions"]
            
            # Assign number of trips based on position (1-5)
            # Top users (higher emissions) get more trips
            # Map position to trip count: 0->5, 1->4, 2->4, 3->3, 4->2, 5->1
            # But add some randomness within the range
            if idx == 0:
                num_trips = random.randint(4, 5)  # Top user: 4-5 trips
            elif idx == 1:
                num_trips = random.randint(3, 5)  # 2nd: 3-5 trips
            elif idx == 2:
                num_trips = random.randint(3, 4)  # 3rd: 3-4 trips
            elif idx == 3:
                num_trips = random.randint(2, 3)  # 4th: 2-3 trips
            elif idx == 4:
                num_trips = random.randint(1, 2)  # 5th: 1-2 trips
            else:
                num_trips = 1  # 6th: 1 trip
            
            # Store num_trips in user dict for summary
            user["num_trips"] = num_trips
            
            print(f"\n{username} (rank {idx+1}, {total_emissions} kg CO₂): Creating {num_trips} trip(s)...")
            
            # Distribute emissions across trips (with some variation)
            emissions_per_trip = total_emissions / num_trips
            remaining_emissions = total_emissions
            
            for trip_num in range(num_trips):
                try:
                    # Last trip gets remaining emissions to ensure total matches
                    if trip_num == num_trips - 1:
                        trip_emissions = round(remaining_emissions, 2)
                    else:
                        # Add some variation (±20%) to each trip's emissions
                        variation = random.uniform(0.8, 1.2)
                        trip_emissions = round(emissions_per_trip * variation, 2)
                        remaining_emissions -= trip_emissions
                    
                    destination = random.choice(DESTINATIONS)
                    # Vary trip dates so they don't all overlap
                    days_ago = random.randint(30, 180) + (trip_num * 30)  # Stagger trips
                    start_date = date.today() - timedelta(days=days_ago)
                    end_date = start_date + timedelta(days=random.randint(5, 14))
                    num_days = (end_date - start_date).days
                    
                    # Create a simple itinerary data structure
                    itinerary_data = {
                        "destination": destination,
                        "start_date": start_date.isoformat(),
                        "end_date": end_date.isoformat(),
                        "num_days": num_days,
                        "budget": random.randint(2000, 8000),
                        "mode": random.choice(["balanced", "price-optimal"]),
                        "days": [
                            {
                                "day": day,
                                "morning": f"Morning activity in {destination}",
                                "afternoon": f"Afternoon activity in {destination}",
                                "evening": f"Evening activity in {destination}"
                            }
                            for day in range(1, num_days + 1)
                        ],
                        "totals": {
                            "cost": random.randint(2000, 8000),
                            "emissions_kg": trip_emissions
                        },
                        "rationale": f"A wonderful trip to {destination}"
                    }
                    
                    trip_data = {
                        "user_id": user_id,
                        "trip_name": f"{destination} Trip {trip_num + 1}",
                        "destination": destination,
                        "start_date": start_date.isoformat(),
                        "end_date": end_date.isoformat(),
                        "num_days": num_days,
                        "budget": itinerary_data["budget"],
                        "mode": itinerary_data["mode"],
                        "itinerary_data": itinerary_data,
                        "trip_status": "after",  # Completed trip
                        "carbon_emissions_kg": trip_emissions,
                        "carbon_credits": round(random.uniform(0, trip_emissions * 0.3), 2)  # Random credits up to 30% of emissions
                    }
                    
                    result = admin_client.table("saved_trips").insert(trip_data).execute()
                    print(f"  ✅ Trip {trip_num + 1}/{num_trips}: {destination} ({trip_emissions} kg CO₂)")
                    
                except Exception as e:
                    print(f"  ❌ Error creating trip {trip_num + 1}: {e}")
        
        # Find brookexu@princeton.edu user and set up friendships and carbon emissions
        print("=" * 60)
        print("Setting up brookexu@princeton.edu...")
        print("=" * 60)
        
        brooke_user_id = None
        try:
            # Get user by email using Supabase Admin API
            list_users_url = f"{supabase_url}/auth/v1/admin/users"
            headers = {
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json"
            }
            
            # List all users and find brookexu@princeton.edu
            response = requests.get(list_users_url, headers=headers, params={"per_page": 1000})
            
            if response.status_code == 200:
                users_data = response.json()
                for user in users_data.get("users", []):
                    if user.get("email") == "brookexu@princeton.edu":
                        brooke_user_id = user.get("id")
                        print(f"✅ Found brookexu@princeton.edu user: {brooke_user_id}")
                        break
            
            if not brooke_user_id:
                print("⚠️  Warning: brookexu@princeton.edu user not found. Skipping friendship setup.")
            else:
                # Create friendships between brookexu and all new users
                print(f"\nCreating friendships with {len(created_users)} users...")
                for user in created_users:
                    try:
                        # Create friendship (one direction - queries check both directions)
                        friendship = {
                            "user_id": brooke_user_id,
                            "friend_id": user["user_id"],
                            "status": "accepted"
                        }
                        
                        # Use upsert to avoid duplicates
                        admin_client.table("friendships").upsert(friendship).execute()
                        print(f"  ✅ Created friendship with {user['username']}")
                    except Exception as e:
                        print(f"  ❌ Error creating friendship with {user['username']}: {e}")
                
                # Create completed trip for brookexu with 5982.3 kg CO₂
                print(f"\nCreating completed trip for brookexu@princeton.edu with 5982.3 kg CO₂...")
                try:
                    destination = random.choice(DESTINATIONS)
                    start_date = date.today() - timedelta(days=random.randint(30, 180))
                    end_date = start_date + timedelta(days=random.randint(5, 14))
                    num_days = (end_date - start_date).days
                    carbon_emissions = 5982.3
                    
                    itinerary_data = {
                        "destination": destination,
                        "start_date": start_date.isoformat(),
                        "end_date": end_date.isoformat(),
                        "num_days": num_days,
                        "budget": random.randint(2000, 8000),
                        "mode": random.choice(["balanced", "price-optimal"]),
                        "days": [
                            {
                                "day": day,
                                "morning": f"Morning activity in {destination}",
                                "afternoon": f"Afternoon activity in {destination}",
                                "evening": f"Evening activity in {destination}"
                            }
                            for day in range(1, num_days + 1)
                        ],
                        "totals": {
                            "cost": random.randint(2000, 8000),
                            "emissions_kg": carbon_emissions
                        },
                        "rationale": f"A wonderful trip to {destination}"
                    }
                    
                    trip_data = {
                        "user_id": brooke_user_id,
                        "trip_name": f"{destination} Trip",
                        "destination": destination,
                        "start_date": start_date.isoformat(),
                        "end_date": end_date.isoformat(),
                        "num_days": num_days,
                        "budget": itinerary_data["budget"],
                        "mode": itinerary_data["mode"],
                        "itinerary_data": itinerary_data,
                        "trip_status": "after",  # Completed trip
                        "carbon_emissions_kg": carbon_emissions,
                        "carbon_credits": round(random.uniform(0, carbon_emissions * 0.3), 2)
                    }
                    
                    result = admin_client.table("saved_trips").insert(trip_data).execute()
                    print(f"  ✅ Created completed trip to {destination} with {carbon_emissions} kg CO₂")
                    
                except Exception as e:
                    print(f"  ❌ Error creating trip for brookexu: {e}")
                    import traceback
                    traceback.print_exc()
        
        except Exception as e:
            print(f"❌ Error setting up brookexu@princeton.edu: {e}")
            import traceback
            traceback.print_exc()
        
        # Find andy.cui@princeton.edu user and set up friendships and carbon emissions
        print("\n" + "=" * 60)
        print("Setting up andy.cui@princeton.edu...")
        print("=" * 60)
        
        andy_user_id = None
        try:
            # Get user by email using Supabase Admin API
            list_users_url = f"{supabase_url}/auth/v1/admin/users"
            headers = {
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json"
            }
            
            # List all users and find andy.cui@princeton.edu
            response = requests.get(list_users_url, headers=headers, params={"per_page": 1000})
            
            if response.status_code == 200:
                users_data = response.json()
                for user in users_data.get("users", []):
                    if user.get("email") == "andy.cui@princeton.edu":
                        andy_user_id = user.get("id")
                        print(f"✅ Found andy.cui@princeton.edu user: {andy_user_id}")
                        break
            
            if not andy_user_id:
                print("⚠️  Warning: andy.cui@princeton.edu user not found. Skipping friendship setup.")
            else:
                # Create friendships between andy and all new users
                print(f"\nCreating friendships with {len(created_users)} users...")
                for user in created_users:
                    try:
                        # Create friendship (one direction - queries check both directions)
                        friendship = {
                            "user_id": andy_user_id,
                            "friend_id": user["user_id"],
                            "status": "accepted"
                        }
                        
                        # Use upsert to avoid duplicates
                        admin_client.table("friendships").upsert(friendship).execute()
                        print(f"  ✅ Created friendship with {user['username']}")
                    except Exception as e:
                        print(f"  ❌ Error creating friendship with {user['username']}: {e}")
                
                # Create completed trip for andy with 3450.8 kg CO₂
                print(f"\nCreating completed trip for andy.cui@princeton.edu with 3450.8 kg CO₂...")
                try:
                    destination = random.choice(DESTINATIONS)
                    start_date = date.today() - timedelta(days=random.randint(30, 180))
                    end_date = start_date + timedelta(days=random.randint(5, 14))
                    num_days = (end_date - start_date).days
                    carbon_emissions = 3450.8
                    
                    itinerary_data = {
                        "destination": destination,
                        "start_date": start_date.isoformat(),
                        "end_date": end_date.isoformat(),
                        "num_days": num_days,
                        "budget": random.randint(2000, 8000),
                        "mode": random.choice(["balanced", "price-optimal"]),
                        "days": [
                            {
                                "day": day,
                                "morning": f"Morning activity in {destination}",
                                "afternoon": f"Afternoon activity in {destination}",
                                "evening": f"Evening activity in {destination}"
                            }
                            for day in range(1, num_days + 1)
                        ],
                        "totals": {
                            "cost": random.randint(2000, 8000),
                            "emissions_kg": carbon_emissions
                        },
                        "rationale": f"A wonderful trip to {destination}"
                    }
                    
                    trip_data = {
                        "user_id": andy_user_id,
                        "trip_name": f"{destination} Trip",
                        "destination": destination,
                        "start_date": start_date.isoformat(),
                        "end_date": end_date.isoformat(),
                        "num_days": num_days,
                        "budget": itinerary_data["budget"],
                        "mode": itinerary_data["mode"],
                        "itinerary_data": itinerary_data,
                        "trip_status": "after",  # Completed trip
                        "carbon_emissions_kg": carbon_emissions,
                        "carbon_credits": round(random.uniform(0, carbon_emissions * 0.3), 2)
                    }
                    
                    result = admin_client.table("saved_trips").insert(trip_data).execute()
                    print(f"  ✅ Created completed trip to {destination} with {carbon_emissions} kg CO₂")
                    
                except Exception as e:
                    print(f"  ❌ Error creating trip for andy: {e}")
                    import traceback
                    traceback.print_exc()
        
        except Exception as e:
            print(f"❌ Error setting up andy.cui@princeton.edu: {e}")
            import traceback
            traceback.print_exc()
        
        print("\n" + "=" * 60)
        print("✅ Successfully created 6 user profiles!")
        print("=" * 60)
        print("\nUser credentials (for testing):")
        for i, user in enumerate(created_users, 1):
            print(f"\n{i}. {user['username']} (Rank {i})")
            print(f"   Email: {user['email']}")
            print(f"   Password: {user['password']}")
            print(f"   Carbon Emissions: {user['carbon_emissions']} kg CO₂")
            print(f"   Completed Trips: {user.get('num_trips', 1)}")
        
        if brooke_user_id:
            print(f"\n✅ brookexu@princeton.edu is now friends with all {len(created_users)} users")
            print(f"✅ brookexu@princeton.edu has 5982.3 kg CO₂ emissions")
        
        if andy_user_id:
            print(f"✅ andy.cui@princeton.edu is now friends with all {len(created_users)} users")
            print(f"✅ andy.cui@princeton.edu has 3450.8 kg CO₂ emissions")
        
        return True
        
    except Exception as e:
        print(f'❌ Error: {e}')
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = generate_test_users()
    sys.exit(0 if success else 1)

