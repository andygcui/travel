import re
from typing import Tuple, Optional

def fast_intent_entity(message: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Quickly detect simple remove/add/skip/avoid intent and extract entity using regex.
    Returns (intent, entity) or (None, None) if not matched.
    """
    message_lower = message.lower()
    removal_patterns = [
        r"remove ([\w\s\-']+)",
        r"eliminate ([\w\s\-']+)",
        r"skip ([\w\s\-']+)",
        r"don't go to ([\w\s\-']+)",
        r"dont go to ([\w\s\-']+)",
        r"do not go to ([\w\s\-']+)",
        r"avoid ([\w\s\-']+)",
        r"no ([\w\s\-']+)",
        r"not ([\w\s\-']+)",
        r"i don't want to visit ([\w\s\-']+)",
        r"i do not want to visit ([\w\s\-']+)",
        r"don't visit ([\w\s\-']+)",
        r"dont visit ([\w\s\-']+)",
        r"do not visit ([\w\s\-']+)"
    ]
    for pattern in removal_patterns:
        match = re.search(pattern, message_lower)
        if match:
            entity = match.group(1).strip()
            return "remove", entity
    # Add patterns for 'add' or other intents if needed
    return None, None
