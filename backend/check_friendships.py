#!/usr/bin/env python3
"""Check friendships in the database"""
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
    except Exception as e:
        print(f"Error getting email for {user_id}: {e}")
    return None

def check_friendships(user_id: str = None):
    """Check friendships for a specific user or all friendships"""
    client = get_supabase_client()
    if not client:
        print('❌ Supabase client not initialized')
        return
    
    print('=' * 60)
    print('FRIENDSHIPS')
    print('=' * 60)
    
    try:
        if user_id:
            # Get all friendships where user is involved
            result = client.table('friendships').select('*').or_(
                f'user_id.eq.{user_id},friend_id.eq.{user_id}'
            ).execute()
        else:
            result = client.table('friendships').select('*').execute()
        
        if not result.data or len(result.data) == 0:
            print('No friendships found')
        else:
            print(f'\nFound {len(result.data)} friendship(s):\n')
            for friendship in result.data:
                user_id_val = friendship.get("user_id")
                friend_id_val = friendship.get("friend_id")
                status = friendship.get("status")
                
                user_email = get_user_email(user_id_val)
                friend_email = get_user_email(friend_id_val)
                
                print(f'Friendship ID: {friendship.get("id")}')
                print(f'  User: {user_id_val} ({user_email or "unknown"})')
                print(f'  Friend: {friend_id_val} ({friend_email or "unknown"})')
                print(f'  Status: {status}')
                print(f'  Created: {friendship.get("created_at")}')
                print(f'  Updated: {friendship.get("updated_at")}')
                print()
    except Exception as e:
        print(f'Error: {e}')
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    user_id = sys.argv[1] if len(sys.argv) > 1 else None
    check_friendships(user_id)

