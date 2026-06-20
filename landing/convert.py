import os
from PIL import Image
import glob

# Convert images in assets/screenshots
image_dir = 'assets/screenshots'
for img_path in glob.glob(f'{image_dir}/*.png'):
    print(f"Converting {img_path}...")
    img = Image.open(img_path)
    webp_path = img_path.rsplit('.', 1)[0] + '.webp'
    img.save(webp_path, 'webp', optimize=True, quality=80)
    print(f"Saved {webp_path}")
