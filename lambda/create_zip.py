#!/usr/bin/env python3
"""
Create Lambda deployment ZIP with all files including predict.py
"""
import zipfile
import os
from pathlib import Path

def create_lambda_zip():
    package_dir = Path('package')
    zip_path = Path('lambda-package-v4.zip')

    # Remove old ZIP if exists
    if zip_path.exists():
        zip_path.unlink()

    print(f"Creating ZIP from {package_dir}")

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(package_dir):
            for file in files:
                file_path = Path(root) / file
                arcname = file_path.relative_to(package_dir)
                print(f"Adding: {arcname}")
                zipf.write(file_path, arcname)

    print(f"\n✅ Created {zip_path}")
    print(f"   Size: {zip_path.stat().st_size / (1024*1024):.2f} MB")

    # Verify predict.py is in ZIP
    with zipfile.ZipFile(zip_path, 'r') as zipf:
        files = zipf.namelist()
        if 'predict.py' in files:
            print("✅ predict.py found in ZIP")
        else:
            print("❌ predict.py NOT in ZIP!")
            print(f"Files at root: {[f for f in files if '/' not in f]}")

if __name__ == '__main__':
    os.chdir(Path(__file__).parent)
    create_lambda_zip()
