#!/usr/bin/env python3
"""Detailed check of user preferences to diagnose issues"""
import os
import sys
from dotenv import load_dotenv
from services.supabase_client import get_supabase_client
import requests

load_dotenv()

def get_user_email(user_id: str):
    """Get user email from auth.users table"""
    try:
        supabase_url = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
        service_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        
        if supabase_url and service_key:
            admin_url = f"{supabase_url}/auth/v1/admin/users"
            headers = {
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
            }
            response = requests.get(f"{admin_url}/{user_id}", headers=headers)
            if response.status_code == 200:
                user_data = response.json()
                if isinstance(user_data, dict) and 'email' in user_data:
                    return user_data['email']
                elif isinstance(user_data, dict) and 'user' in user_data:
                    return user_data['user'].get('email', '')
    except Exception as e:
        print(f"Error getting email: {e}")
    return None

def check_user_preferences_detailed(email: str = None, user_id: str = None):
    """Check user preferences in detail"""
    client = get_supabase_client()
    if not client:
        print('❌ Supabase client not initialized')
        return
    
    print('=' * 80)
    print('DETAILED USER PREFERENCES CHECK')
    print('=' * 80)
    
    try:
        # Find user by email if provided
        if email and not user_id:
            # Get user ID from auth
            supabase_url = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
            service_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
            if supabase_url and service_key:
                admin_url = f"{supabase_url}/auth/v1/admin/users"
                headers = {
                    "apikey": service_key,
                    "Authorization": f"Bearer {service_key}",
                }
                response = requests.get(f"{admin_url}?email={email}", headers=headers)
                if response.status_code == 200:
                    users_data = response.json()
                    # Handle different response formats
                    if isinstance(users_data, list) and len(users_data) > 0:
                        user_id = users_data[0].get('id')
                    elif isinstance(users_data, dict):
                        if 'users' in users_data and len(users_data['users']) > 0:
                            user_id = users_data['users'][0].get('id')
                        elif 'id' in users_data:
                            user_id = users_data['id']
        
        if not user_id:
            print('❌ No user ID or email provided')
            return
        
        print(f'\nUser ID: {user_id}')
        email_found = get_user_email(user_id)
        if email_found:
            print(f'Email: {email_found}')
        
        # Check user_preferences table
        print('\n' + '-' * 80)
        print('REGISTRATION PREFERENCES (user_preferences table)')
        print('-' * 80)
        result = client.table("user_preferences").select("*").eq("user_id", user_id).execute()
        
        if not result.data or len(result.data) == 0:
            print('No registration preferences found')
        else:
            prefs = result.data[0]
            print(f'Preferences array: {prefs.get("preferences", [])}')
            print(f'Likes array: {prefs.get("likes", [])}')
            print(f'Dislikes array: {prefs.get("dislikes", [])}')
            print(f'Dietary restrictions: {prefs.get("dietary_restrictions", [])}')
            print(f'Username: {prefs.get("username", "none")}')
        
        # Check chat_preferences table
        print('\n' + '-' * 80)
        print('CHAT PREFERENCES (chat_preferences table)')
        print('-' * 80)
        chat_result = client.table("chat_preferences").select("*").eq("user_id", user_id).execute()
        
        if not chat_result.data or len(chat_result.data) == 0:
            print('No chat preferences found')
        else:
            print(f'Found {len(chat_result.data)} chat preference(s):\n')
            for pref in chat_result.data:
                print(f'  - {pref.get("preference_type")} / {pref.get("preference_category")}: {pref.get("preference_value")} (frequency: {pref.get("frequency", 1)})')
                print(f'    Extracted from: {pref.get("extracted_from_message", "unknown")[:50]}...')
        
        # Check for "shopping" specifically
        print('\n' + '-' * 80)
        print('CHECKING FOR "shopping" PREFERENCE')
        print('-' * 80)
        
        # In registration preferences
        if result.data and len(result.data) > 0:
            prefs = result.data[0]
            reg_prefs = prefs.get("preferences", [])
            reg_likes = prefs.get("likes", [])
            
            shopping_in_prefs = [p for p in reg_prefs if "shopping" in p.lower()]
            shopping_in_likes = [p for p in reg_likes if "shopping" in p.lower()]
            
            if shopping_in_prefs:
                print(f'⚠️  Found "shopping" in registration preferences array: {shopping_in_prefs}')
            if shopping_in_likes:
                print(f'⚠️  Found "shopping" in likes array: {shopping_in_likes}')
            if not shopping_in_prefs and not shopping_in_likes:
                print('✓ "shopping" NOT found in registration preferences')
        
        # In chat preferences
        if chat_result.data:
            shopping_in_chat = [p for p in chat_result.data if "shopping" in p.get("preference_value", "").lower()]
            if shopping_in_chat:
                print(f'⚠️  Found "shopping" in chat preferences:')
                for pref in shopping_in_chat:
                    print(f'    - {pref.get("preference_type")} / {pref.get("preference_category")}: {pref.get("preference_value")}')
                    print(f'      Extracted from: {pref.get("extracted_from_message", "unknown")[:100]}...')
            else:
                print('✓ "shopping" NOT found in chat preferences')
        
    except Exception as e:
        print(f'Error: {e}')
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    email = sys.argv[1] if len(sys.argv) > 1 else None
    user_id = sys.argv[2] if len(sys.argv) > 2 else None
    check_user_preferences_detailed(email, user_id)

