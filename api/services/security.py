import os
import shutil
from pathlib import Path

try:
    from cryptography.fernet import Fernet
except ImportError:
    Fernet = None

class VaultService:
    @staticmethod
    def generate_key():
        if Fernet is None:
            raise ImportError("cryptography is not installed. Run 'pip install cryptography' to use VaultService.")
        return Fernet.generate_key()

    @staticmethod
    def encrypt_directory(dir_path: str, key: bytes):
        """Zips and encrypts a directory."""
        if Fernet is None:
            raise ImportError("cryptography is not installed.")
        if not os.path.exists(dir_path):
            return

        # Zip the directory
        shutil.make_archive(dir_path, 'zip', dir_path)
        zip_path = dir_path + ".zip"
        
        # Encrypt the zip file
        fernet = Fernet(key)
        with open(zip_path, "rb") as f:
            data = f.read()
        
        encrypted_data = fernet.encrypt(data)
        
        with open(dir_path + ".enc", "wb") as f:
            f.write(encrypted_data)
            
        # Clean up
        os.remove(zip_path)
        shutil.rmtree(dir_path)

    @staticmethod
    def decrypt_directory(enc_path: str, key: bytes):
        """Decrypts and unzips a directory."""
        if Fernet is None:
            raise ImportError("cryptography is not installed.")
        if not os.path.exists(enc_path):
            return

        fernet = Fernet(key)
        with open(enc_path, "rb") as f:
            encrypted_data = f.read()
            
        decrypted_data = fernet.decrypt(encrypted_data)
        
        dir_path = enc_path.replace(".enc", "")
        zip_path = dir_path + ".zip"
        
        with open(zip_path, "wb") as f:
            f.write(decrypted_data)
            
        # Extract the zip file
        if os.path.exists(dir_path):
            shutil.rmtree(dir_path)
        os.makedirs(dir_path)
        shutil.unpack_archive(zip_path, dir_path, 'zip')
        
        # Clean up
        os.remove(zip_path)
        os.remove(enc_path)