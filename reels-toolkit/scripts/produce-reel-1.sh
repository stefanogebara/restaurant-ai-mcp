#!/bin/bash
# =============================================================================
# SEATABLE REEL #1 — "Your Restaurant Never Sleeps"
# Complete video production with ffmpeg
#
# Produces a 30-second 9:16 Instagram Reel:
#   Scene 1 (0-3s):   Dark wine glass photo + Ken Burns + "seatable." text
#   Scene 2 (3-7s):   Dark restaurant photo + VO: "Last night at 2AM..."
#   Scene 3 (7-11s):  Dark candles photo + VO: "Your AI answered..."
#   Scene 4 (11-17s): Product dashboard recording composited + VO: "Sofia handles..."
#   Scene 5 (17-20s): Happy couple photo + VO: "While you sleep..."
#   Scene 6 (20-22s): Dark plating photo + big stats text
#   Scene 7 (22-25s): Dark bar photo + logo + CTA
#
# Usage: bash reels-toolkit/scripts/produce-reel-1.sh
# =============================================================================

set -e
cd "C:/Users/stefa/restaurant-ai-mcp/reels-toolkit"

OUT="output"
mkdir -p "$OUT/scenes"

W=1080
H=1920
FPS=30
FONT="Inter"
FONTB="Inter"

ASSETS="assets"
VO="voiceovers/en"
PRODUCT="videos/reel-full-walkthrough.webm"

echo "🎬 Producing Reel #1: Your Restaurant Never Sleeps"
echo ""

# =============================================================================
# STEP 1: Create Ken Burns scenes from photos
# Each photo becomes a 9:16 video with slow zoom/pan
# =============================================================================

echo "📸 Scene 1: Wine glass + logo (3s)"
ffmpeg -y -loop 1 -i "$ASSETS/dark-wine-glass.jpg" \
  -vf "scale=2160:3840,zoompan=z='min(zoom+0.0008,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$((3*FPS)):s=${W}x${H}:fps=$FPS,
  drawtext=text='seatable.':fontfile='C\\:/Windows/Fonts/georgia.ttf':fontsize=56:fontcolor=white:x=80:y=h-160:alpha='if(lt(t,0.5),t/0.5,1)',
  drawtext=text='Your AI host that never misses.':fontfile='C\\:/Windows/Fonts/arial.ttf':fontsize=22:fontcolor=0xA8A29E:x=80:y=h-100:alpha='if(lt(t,1),0,if(lt(t,1.5),(t-1)/0.5,1))',
  format=yuv420p" \
  -t 3 -r $FPS "$OUT/scenes/s01.mp4" 2>/dev/null
echo "  ✅ s01.mp4"

echo "📸 Scene 2: Restaurant + hook VO (4s)"
ffmpeg -y -loop 1 -i "$ASSETS/dark-dining.jpg" \
  -vf "scale=2160:3840,zoompan=z='min(zoom+0.0006,1.12)':x='iw/4':y='ih/2-(ih/zoom/2)':d=$((4*FPS)):s=${W}x${H}:fps=$FPS,
  format=yuv420p" \
  -t 4 -r $FPS "$OUT/scenes/s02.mp4" 2>/dev/null
echo "  ✅ s02.mp4"

echo "📸 Scene 3: Candles + reveal VO (4s)"
ffmpeg -y -loop 1 -i "$ASSETS/dark-candles.jpg" \
  -vf "scale=2160:3840,zoompan=z='min(zoom+0.0007,1.13)':x='iw/2-(iw/zoom/2)':y='ih/3':d=$((4*FPS)):s=${W}x${H}:fps=$FPS,
  drawtext=text='Your AI answered.':fontfile='C\\:/Windows/Fonts/georgia.ttf':fontsize=64:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:alpha='if(lt(t,0.8),0,if(lt(t,1.3),(t-0.8)/0.5,if(lt(t,3),1,1-(t-3)/0.5)))':enable='between(t,0.5,3.5)',
  format=yuv420p" \
  -t 4 -r $FPS "$OUT/scenes/s03.mp4" 2>/dev/null
echo "  ✅ s03.mp4"

# =============================================================================
# STEP 2: Extract dashboard portion from product recording
# Take the 4s-14s segment (after login, showing the dashboard)
# Scale and composite over dark background
# =============================================================================

echo "💻 Scene 4: Product dashboard composite (6s)"
# Extract dashboard segment from the walkthrough (seconds 20-32 = dashboard with data)
ffmpeg -y -ss 20 -t 6 -i "$PRODUCT" \
  -loop 1 -i "$ASSETS/dark-bar.jpg" \
  -filter_complex "
  [1:v]scale=2160:3840,zoompan=z='1.05':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$((6*FPS)):s=${W}x${H}:fps=$FPS[bg];
  [0:v]scale=860:-2[dash];
  [bg][dash]overlay=(W-860)/2:(H-860*9/16)/2-100:enable='between(t,0,6)'[comp];
  [comp]drawtext=text='':fontsize=1:fontcolor=white:x=0:y=0,
  drawbox=x=$((W/2-430-8)):y=$((H/2-242-108)):w=876:h=497:color=0x1a1a1a@0.9:t=fill,
  drawbox=x=$((W/2-430-4)):y=$((H/2-242-104)):w=868:h=489:color=0x1a1a1a@0.6:t=2,
  format=yuv420p
  " \
  -t 6 -r $FPS "$OUT/scenes/s04.mp4" 2>/dev/null
echo "  ✅ s04.mp4"

echo "📸 Scene 5: Restaurant + impact VO (3s)"
ffmpeg -y -loop 1 -i "$ASSETS/dark-restaurant-1.jpg" \
  -vf "scale=2160:3840,zoompan=z='min(zoom+0.0008,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$((3*FPS)):s=${W}x${H}:fps=$FPS,
  drawtext=text='Zero missed calls.':fontfile='C\\:/Windows/Fonts/georgia.ttf':fontsize=72:fontcolor=white:x=(w-text_w)/2:y=h/2-80:alpha='if(lt(t,0.3),t/0.3,1)',
  drawtext=text='Every table filled.':fontfile='C\\:/Windows/Fonts/georgia.ttf':fontsize=72:fontcolor=white:x=(w-text_w)/2:y=h/2+20:alpha='if(lt(t,0.6),0,if(lt(t,1),(t-0.6)/0.4,1))',
  format=yuv420p" \
  -t 3 -r $FPS "$OUT/scenes/s05.mp4" 2>/dev/null
echo "  ✅ s05.mp4"

echo "📸 Scene 6: Stats numbers (3s)"
ffmpeg -y -loop 1 -i "$ASSETS/dark-plating.jpg" \
  -vf "scale=2160:3840,zoompan=z='min(zoom+0.0005,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$((3*FPS)):s=${W}x${H}:fps=$FPS,
  drawtext=text='47':fontfile='C\\:/Windows/Fonts/georgia.ttf':fontsize=180:fontcolor=white:x=120:y=h/2-180:alpha='if(lt(t,0.3),t/0.3,1)',
  drawtext=text='calls handled':fontfile='C\\:/Windows/Fonts/arial.ttf':fontsize=28:fontcolor=0x888888:x=120:y=h/2+20:alpha='if(lt(t,0.5),0,if(lt(t,0.8),(t-0.5)/0.3,1))',
  drawtext=text='0':fontfile='C\\:/Windows/Fonts/georgia.ttf':fontsize=180:fontcolor=0x9F1239:x=w-320:y=h/2-180:alpha='if(lt(t,0.5),0,if(lt(t,0.8),(t-0.5)/0.3,1))',
  drawtext=text='missed':fontfile='C\\:/Windows/Fonts/arial.ttf':fontsize=28:fontcolor=0x888888:x=w-280:y=h/2+20:alpha='if(lt(t,0.8),0,if(lt(t,1.1),(t-0.8)/0.3,1))',
  format=yuv420p" \
  -t 3 -r $FPS "$OUT/scenes/s06.mp4" 2>/dev/null
echo "  ✅ s06.mp4"

echo "📸 Scene 7: CTA + logo (3s)"
ffmpeg -y -loop 1 -i "$ASSETS/dark-bar.jpg" \
  -vf "scale=2160:3840,zoompan=z='min(zoom+0.0004,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$((3*FPS)):s=${W}x${H}:fps=$FPS,
  drawtext=text='seatable.':fontfile='C\\:/Windows/Fonts/georgia.ttf':fontsize=96:fontcolor=white:x=(w-text_w)/2:y=h/2-120:alpha='if(lt(t,0.3),t/0.3,1)',
  drawtext=text='Try it free':fontfile='C\\:/Windows/Fonts/arial.ttf':fontsize=32:fontcolor=0x9F1239:x=(w-text_w)/2:y=h/2+20:alpha='if(lt(t,0.5),0,if(lt(t,0.8),(t-0.5)/0.3,1))',
  drawtext=text='seatable.one':fontfile='C\\:/Windows/Fonts/arial.ttf':fontsize=24:fontcolor=0x888888:x=(w-text_w)/2:y=h/2+80:alpha='if(lt(t,0.8),0,if(lt(t,1.1),(t-0.8)/0.3,1))',
  format=yuv420p" \
  -t 3 -r $FPS "$OUT/scenes/s07.mp4" 2>/dev/null
echo "  ✅ s07.mp4"

# =============================================================================
# STEP 3: Concatenate all scenes
# =============================================================================

echo ""
echo "🔗 Concatenating scenes..."

cat > "$OUT/scenes/concat.txt" << 'CONCAT'
file 's01.mp4'
file 's02.mp4'
file 's03.mp4'
file 's04.mp4'
file 's05.mp4'
file 's06.mp4'
file 's07.mp4'
CONCAT

ffmpeg -y -f concat -safe 0 -i "$OUT/scenes/concat.txt" \
  -c:v libx264 -preset medium -crf 20 \
  -pix_fmt yuv420p -r $FPS \
  "$OUT/reel1-video-only.mp4" 2>/dev/null
echo "  ✅ reel1-video-only.mp4"

# =============================================================================
# STEP 4: Concatenate all voiceover clips with gaps
# =============================================================================

echo ""
echo "🎙️ Building voiceover track..."

# Create silence gaps between clips to match scene timing
# Scene 1: 3s (no VO, just music)
# Scene 2: 4s → hook (3.3s) + pad
# Scene 3: 4s → reveal (3.7s) + pad
# Scene 4: 6s → demo (3.3s) + gap
# Scene 5: 3s → impact (2.1s) + pad
# Scene 6: 3s (no VO)
# Scene 7: 3s → cta (2.0s) + pad

ffmpeg -y \
  -f lavfi -i "anullsrc=r=44100:cl=stereo" \
  -i "$VO/reel-01-hook.mp3" \
  -i "$VO/reel-01-reveal.mp3" \
  -i "$VO/reel-01-demo.mp3" \
  -i "$VO/reel-01-impact.mp3" \
  -i "$VO/reel-01-cta.mp3" \
  -filter_complex "
  [0:a]atrim=0:3,asetpts=PTS-STARTPTS[gap1];
  [1:a]asetpts=PTS-STARTPTS[vo1];
  [0:a]atrim=0:0.5,asetpts=PTS-STARTPTS[gap2];
  [2:a]asetpts=PTS-STARTPTS[vo2];
  [0:a]atrim=0:0.3,asetpts=PTS-STARTPTS[gap3];
  [3:a]asetpts=PTS-STARTPTS[vo3];
  [0:a]atrim=0:2.5,asetpts=PTS-STARTPTS[gap4];
  [4:a]asetpts=PTS-STARTPTS[vo4];
  [0:a]atrim=0:3.8,asetpts=PTS-STARTPTS[gap5];
  [5:a]asetpts=PTS-STARTPTS[vo5];
  [0:a]atrim=0:1,asetpts=PTS-STARTPTS[gap6];
  [gap1][vo1][gap2][vo2][gap3][vo3][gap4][vo4][gap5][vo5][gap6]concat=n=11:v=0:a=1[votrack]
  " -map "[votrack]" -t 26 "$OUT/voiceover-track.mp3" 2>/dev/null
echo "  ✅ voiceover-track.mp3"

# =============================================================================
# STEP 5: Combine video + voiceover into final Reel
# =============================================================================

echo ""
echo "🎬 Final composition..."

ffmpeg -y \
  -i "$OUT/reel1-video-only.mp4" \
  -i "$OUT/voiceover-track.mp3" \
  -c:v copy -c:a aac -b:a 192k \
  -shortest \
  "$OUT/seatable-reel-1-final.mp4" 2>/dev/null

echo ""
echo "✅ DONE! Final Reel saved to:"
echo "   reels-toolkit/output/seatable-reel-1-final.mp4"
echo ""
echo "   Duration: ~26 seconds"
echo "   Resolution: 1080x1920 (9:16)"
echo "   Audio: ElevenLabs voiceover"
echo ""
echo "   Next: Add background music in CapCut (optional)"
echo "   or post directly to Instagram!"
