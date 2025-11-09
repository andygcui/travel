#!/usr/bin/env python3
"""Check user preferences in the database"""
from services.supabase_client import get_supabase_client
import os
import sys
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

def get_user_email(user_id: str):
    """Get user email from auth.users table"""
    try:
        supabase_url = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
        service_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
        
        if supabase_url and service_key:
            admin_client = create_client(supabase_url, service_key)
            response = admin_client.auth.admin.get_user_by_id(user_id)
            if response.user:
                return response.user.email
    except Exception:
        pass
    return None

def check_user_preferences(user_id: str = None):
    """Check preferences for a specific user or all users"""
    client = get_supabase_client()
    if not client:
        print('❌ Supabase client not initialized')
        return
    
    print('=' * 60)
    print('USER PREFERENCES (Registration Preferences)')
    print('=' * 60)
    
    try:
        if user_id:
            result = client.table('user_preferences').select('*').eq('user_id', user_id).execute()
        else:
            result = client.table('user_preferences').select('*').execute()
        
        if not result.data or len(result.data) == 0:
            print('No user preferences found')
        else:
            for record in result.data:
                uid = record.get("user_id")
                email = get_user_email(uid)
                print(f'\nUser ID: {uid}')
                if email:
                    print(f'  Email: {email}')
                print(f'  Interests: {record.get("preferences", [])}')
                print(f'  Likes: {record.get("likes", [])}')
                print(f'  Dislikes: {record.get("dislikes", [])}')
                print(f'  Dietary Restrictions: {record.get("dietary_restrictions", [])}')
                print(f'  Created: {record.get("created_at")}')
                print(f'  Updated: {record.get("updated_at")}')
    except Exception as e:
        print(f'Error: {e}')
    
    print('\n' + '=' * 60)
    print('CHAT PREFERENCES (Chat-Learned Preferences)')
    print('=' * 60)
    
    try:
        if user_id:
            result = client.table('chat_preferences').select('*').eq('user_id', user_id).execute()
        else:
            result = client.table('chat_preferences').select('*').execute()
        
        if not result.data or len(result.data) == 0:
            print('No chat preferences found')
        else:
            # Group by user_id
            users = {}
            for record in result.data:
                uid = record.get('user_id')
                if uid not in users:
                    users[uid] = []
                users[uid].append(record)
            
            for uid, prefs in users.items():
                print(f'\nUser ID: {uid}')
                for pref in prefs:
                    print(f'  - {pref.get("preference_type")}: {pref.get("preference_category")} = {pref.get("preference_value")} (frequency: {pref.get("frequency")})')
    except Exception as e:
        print(f'Error: {e}')

if __name__ == '__main__':
    user_id = sys.argv[1] if len(sys.argv) > 1 else None
    check_user_preferences(user_id)

