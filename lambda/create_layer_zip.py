#!/usr/bin/env python3
"""
Create Lambda Layer ZIP with ML dependencies
"""
import zipfile
import os
from pathlib import Path

def create_layer_zip():
    layer_dir = Path('layer')
    zip_path = Path('ml-dependencies-layer.zip')

    # Remove old ZIP if exists
    if zip_path.exists():
        zip_path.unlink()

    print(f"Creating Lambda Layer ZIP from {layer_dir}")

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(layer_dir):
            for file in files:
                file_path = Path(root) / file
                # Keep the layer/python structure
                arcname = file_path.relative_to(layer_dir)
                if len(arcname.parts) < 500:  # Safety check
                    zipf.write(file_path, arcname)

    print(f"Created {zip_path}")
    print(f"Size: {zip_path.stat().st_size / (1024*1024):.2f} MB")

if __name__ == '__main__':
    os.chdir(Path(__file__).parent)
    create_layer_zip()
