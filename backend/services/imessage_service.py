"""
iMessage service integration using Photon
This service provides a Python interface to the Photon iMessage Kit
"""

import subprocess
import json
import logging
import os
from typing import Dict, Any, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

# Path to the Photon service script
PHOTON_SERVICE_PATH = Path(__file__).parent.parent.parent / "photon" / "imessage-service.mjs"
PHOTON_EXAMPLE_PATH = Path(__file__).parent.parent.parent / "photon" / "example-usage.mjs"


class IMessageService:
    """Python wrapper for Photon iMessage service"""
    
    def __init__(self):
        self.service_path = PHOTON_SERVICE_PATH
        self.node_executable = self._find_node_executable()
    
    def _find_node_executable(self) -> str:
        """Find Node.js or Bun executable"""
        # Try Bun first (faster)
        for exe in ['bun', 'node']:
            try:
                result = subprocess.run(
                    [exe, '--version'],
                    capture_output=True,
                    text=True,
                    timeout=2
                )
                if result.returncode == 0:
                    logger.info(f"Using {exe} for iMessage service")
                    return exe
            except (FileNotFoundError, subprocess.TimeoutExpired):
                continue
        
        raise RuntimeError("Neither Node.js nor Bun found. Please install one to use iMessage features.")
    
    def _run_script(self, script_content: str, data: Dict[str, Any] = None) -> Dict[str, Any]:
        """Run a Node.js/Bun script with data"""
        try:
            # Get absolute path to photon directory
            photon_dir = self.service_path.parent.resolve()
            service_file = self.service_path.resolve()
            
            # Create a temporary script in the photon directory so relative imports work
            temp_script = str(photon_dir / f"temp_script_{os.getpid()}.mjs")
            
            try:
                with open(temp_script, 'w') as f:
                    f.write(script_content)
                
                # Prepare command
                cmd = [self.node_executable, temp_script]
                if data:
                    cmd.append(json.dumps(data))
                
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=30,
                    cwd=str(photon_dir)
                )
                
                if result.returncode != 0:
                    logger.error(f"Script error: {result.stderr}")
                    return {"success": False, "error": result.stderr}
                
                # Try to parse JSON output
                try:
                    return json.loads(result.stdout) if result.stdout else {"success": True}
                except json.JSONDecodeError:
                    return {"success": True, "output": result.stdout}
            
            finally:
                # Clean up temp file
                try:
                    if os.path.exists(temp_script):
                        os.unlink(temp_script)
                except Exception as e:
                    logger.warning(f"Could not delete temp script: {e}")
        
        except Exception as e:
            logger.error(f"Error running iMessage script: {e}", exc_info=True)
            return {"success": False, "error": str(e)}
    
    def send_text(self, to: str, message: str) -> Dict[str, Any]:
        """Send a text message via iMessage"""
        script = f"""
import PhotonIMessageService from './imessage-service.mjs';

const service = new PhotonIMessageService({{ debug: false }});
const data = JSON.parse(process.argv[2] || '{{}}');

try {{
    const result = await service.sendText(data.to, data.message);
    console.log(JSON.stringify(result));
    await service.close();
}} catch (error) {{
    console.log(JSON.stringify({{ success: false, error: error.message }}));
    await service.close();
}}
"""
        return self._run_script(script, {"to": to, "message": message})
    
    def send_trip_notification(self, to: str, trip_data: Dict[str, Any]) -> Dict[str, Any]:
        """Send a trip notification via iMessage"""
        script = f"""
import PhotonIMessageService from './imessage-service.mjs';

const service = new PhotonIMessageService({{ debug: false }});
const data = JSON.parse(process.argv[2] || '{{}}');

try {{
    const result = await service.sendTripNotification(data.to, data.tripData);
    console.log(JSON.stringify(result));
    await service.close();
}} catch (error) {{
    console.log(JSON.stringify({{ success: false, error: error.message }}));
    await service.close();
}}
"""
        return self._run_script(script, {"to": to, "tripData": trip_data})
    
    def send_itinerary(self, to: str, itinerary: Dict[str, Any]) -> Dict[str, Any]:
        """Send itinerary details via iMessage"""
        script = f"""
import PhotonIMessageService from './imessage-service.mjs';

const service = new PhotonIMessageService({{ debug: false }});
const data = JSON.parse(process.argv[2] || '{{}}');

try {{
    const result = await service.sendItinerary(data.to, data.itinerary);
    console.log(JSON.stringify(result));
    await service.close();
}} catch (error) {{
    console.log(JSON.stringify({{ success: false, error: error.message }}));
    await service.close();
}}
"""
        return self._run_script(script, {"to": to, "itinerary": itinerary})


# Global instance
_imessage_service: Optional[IMessageService] = None


def get_imessage_service() -> Optional[IMessageService]:
    """Get or create the iMessage service instance"""
    global _imessage_service
    
    if _imessage_service is None:
        try:
            _imessage_service = IMessageService()
        except Exception as e:
            logger.warning(f"Could not initialize iMessage service: {e}")
            logger.warning("iMessage features will be disabled. This is normal on non-macOS systems.")
            return None
    
    return _imessage_service


def is_available() -> bool:
    """Check if iMessage service is available"""
    service = get_imessage_service()
    return service is not None

