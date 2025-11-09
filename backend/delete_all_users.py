#!/usr/bin/env python3
"""
Script to delete all users from Supabase
WARNING: This will delete ALL users and ALL related data!
"""
import os
import sys
import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

def delete_all_users():
    """Delete all users from Supabase"""
    supabase_url = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL')
    service_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    if not supabase_url or not service_key:
        print('❌ Missing Supabase credentials')
        print('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file')
        return False
    
    try:
        # Create admin client
        admin_client = create_client(supabase_url, service_key)
        
        # Get all users
        print('Fetching all users...')
        users_response = admin_client.auth.admin.list_users()
        
        if not hasattr(users_response, 'users') or not users_response.users:
            print('No users found')
            return True
        
        users = users_response.users
        print(f'Found {len(users)} user(s)')
        
        # Confirm deletion
        print('\n⚠️  WARNING: This will delete ALL users and ALL related data!')
        confirm = input('Type "DELETE ALL" to confirm: ')
        
        if confirm != 'DELETE ALL':
            print('❌ Deletion cancelled')
            return False
        
        # Delete each user
        deleted_count = 0
        for user in users:
            try:
                print(f'Deleting user: {user.email} ({user.id})')
                admin_client.auth.admin.delete_user(user.id)
                deleted_count += 1
            except Exception as e:
                print(f'❌ Error deleting user {user.email}: {e}')
        
        print(f'\n✅ Successfully deleted {deleted_count} user(s)')
        print('Note: Related data (preferences, trips, friendships) should be deleted via CASCADE')
        return True
        
    except Exception as e:
        print(f'❌ Error: {e}')
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = delete_all_users()
    sys.exit(0 if success else 1)

