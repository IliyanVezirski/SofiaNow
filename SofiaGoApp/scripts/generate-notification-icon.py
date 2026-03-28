"""Generate a simple monochrome bus silhouette icon for Android notifications."""
from PIL import Image, ImageDraw
import os

def draw_bus_icon(size=96):
    """Create a simple bus silhouette: white on transparent background."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Scale factor relative to 96px
    s = size / 96.0
    white = (255, 255, 255, 255)
    transparent = (0, 0, 0, 0)
    
    # Bus body - main rectangle with rounded feel
    body_left = int(14 * s)
    body_right = int(82 * s)
    body_top = int(18 * s)
    body_bottom = int(72 * s)
    corner_r = int(8 * s)
    
    draw.rounded_rectangle(
        [body_left, body_top, body_right, body_bottom],
        radius=corner_r,
        fill=white
    )
    
    # Roof bump / destination sign area
    roof_left = int(24 * s)
    roof_right = int(72 * s)
    roof_top = int(12 * s)
    roof_bottom = int(22 * s)
    draw.rounded_rectangle(
        [roof_left, roof_top, roof_right, roof_bottom],
        radius=int(4 * s),
        fill=white
    )
    
    # Windows - cut out as transparent rectangles
    window_top = int(26 * s)
    window_bottom = int(44 * s)
    window_gap = int(3 * s)
    
    # Windshield (front) 
    draw.rectangle(
        [int(18 * s), window_top, int(30 * s), window_bottom],
        fill=transparent
    )
    
    # Window 1
    draw.rectangle(
        [int(33 * s), window_top, int(45 * s), window_bottom],
        fill=transparent
    )
    
    # Window 2
    draw.rectangle(
        [int(48 * s), window_top, int(60 * s), window_bottom],
        fill=transparent
    )
    
    # Rear window
    draw.rectangle(
        [int(63 * s), window_top, int(78 * s), window_bottom],
        fill=transparent
    )
    
    # Door area - cut out on front
    door_top = int(48 * s)
    door_bottom = int(72 * s)
    draw.rectangle(
        [int(19 * s), door_top, int(33 * s), door_bottom],
        fill=transparent
    )
    
    # Wheel wells / wheels
    wheel_y = int(72 * s)
    wheel_r = int(7 * s)
    
    # Front wheel
    front_wheel_x = int(28 * s)
    draw.ellipse(
        [front_wheel_x - wheel_r, wheel_y - wheel_r,
         front_wheel_x + wheel_r, wheel_y + wheel_r],
        fill=white
    )
    # Inner hub (transparent)
    hub_r = int(3 * s)
    draw.ellipse(
        [front_wheel_x - hub_r, wheel_y - hub_r,
         front_wheel_x + hub_r, wheel_y + hub_r],
        fill=transparent
    )
    
    # Rear wheel
    rear_wheel_x = int(68 * s)
    draw.ellipse(
        [rear_wheel_x - wheel_r, wheel_y - wheel_r,
         rear_wheel_x + wheel_r, wheel_y + wheel_r],
        fill=white
    )
    draw.ellipse(
        [rear_wheel_x - hub_r, wheel_y - hub_r,
         rear_wheel_x + hub_r, wheel_y + hub_r],
        fill=transparent
    )
    
    # Bumper / undercarriage between wheels
    draw.rectangle(
        [int(35 * s), int(72 * s), int(61 * s), int(75 * s)],
        fill=white
    )

    # Headlight (front)
    draw.rectangle(
        [int(14 * s), int(50 * s), int(17 * s), int(56 * s)],
        fill=white
    )
    
    # Taillight (rear)
    draw.rectangle(
        [int(79 * s), int(50 * s), int(82 * s), int(56 * s)],
        fill=white
    )
    
    # Side stripe / detail line (transparent cut)
    draw.rectangle(
        [int(18 * s), int(46 * s), int(78 * s), int(47 * s)],
        fill=transparent
    )

    return img


if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # Generate the main asset icon (96px)
    icon = draw_bus_icon(96)
    asset_path = os.path.join(base_dir, "assets", "android-icon-monochrome.png")
    icon.save(asset_path)
    print(f"Saved: {asset_path}")
    
    # Generate for each Android dpi
    dpi_sizes = {
        "drawable-mdpi": 24,
        "drawable-hdpi": 36,
        "drawable-xhdpi": 48,
        "drawable-xxhdpi": 72,
        "drawable-xxxhdpi": 96,
    }
    
    res_dir = os.path.join(base_dir, "android", "app", "src", "main", "res")
    
    for folder, px in dpi_sizes.items():
        icon = draw_bus_icon(px)
        out_path = os.path.join(res_dir, folder, "notification_icon.png")
        icon.save(out_path)
        print(f"Saved: {out_path} ({px}x{px})")
    
    print("\nDone! All notification icons generated.")
