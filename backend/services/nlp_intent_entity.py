import os
import openai
import json

openai.api_key = os.environ.get("OPENAI_API_KEY")

def extract_intent_and_entity_with_openai(message: str):
    prompt = (
        "Extract the user's intent (remove, add, change, etc.) and the target location or activity from this message. "
        "Respond in JSON: {\"intent\": ..., \"entity\": ...}\n"
        f"Message: '{message}'"
    )
    response = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=60,
        temperature=0
    )
    result = json.loads(response.choices[0].message['content'])
    return result['intent'], result['entity']
