#!/bin/bash
set -e
cd "C:/Users/stefa/restaurant-ai-mcp/reels-toolkit"

VO="voiceovers/kinetic/kinetic-vo.mp3"
OUT="output"
DUR=29

echo "🎬 Building kinetic typography Reel..."

FILTER="
drawtext=text='This is':fontfile='C\:/Windows/Fonts/arial.ttf':fontsize=52:fontcolor=0x888888:x=(w-text_w)/2:y=(h-text_h)/2-40:enable='between(t,0.0,0.35)':alpha='if(lt(t,0.1),t/0.1,1)',
drawtext=text='Seatable.':fontfile='C\:/Windows/Fonts/georgia.ttf':fontsize=96:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2+20:enable='between(t,0.3,0.88)':alpha='if(lt(t-0.3,0.08),(t-0.3)/0.08,if(gt(t,0.78),1-(t-0.78)/0.1,1))',
drawtext=text='Your restaurant\\'s AI.':fontfile='C\:/Windows/Fonts/georgia.ttf':fontsize=72:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,0.89,2.1)':alpha='if(lt(t-0.89,0.1),(t-0.89)/0.1,if(gt(t,2.0),1-(t-2.0)/0.1,1))',
drawtext=text='She answers':fontfile='C\:/Windows/Fonts/arial.ttf':fontsize=56:fontcolor=0x888888:x=(w-text_w)/2:y=(h-text_h)/2-60:enable='between(t,2.4,3.65)':alpha='if(lt(t-2.4,0.06),(t-2.4)/0.06,1)',
drawtext=text='every call.':fontfile='C\:/Windows/Fonts/georgia.ttf':fontsize=84:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2+20:enable='between(t,2.9,3.65)':alpha='if(lt(t-2.9,0.06),(t-2.9)/0.06,if(gt(t,3.55),1-(t-3.55)/0.1,1))',
drawtext=text='Every language.':fontfile='C\:/Windows/Fonts/georgia.ttf':fontsize=80:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,3.7,4.38)':alpha='if(lt(t-3.7,0.05),(t-3.7)/0.05,if(gt(t,4.28),1-(t-4.28)/0.1,1))',
drawtext=text='Every hour.':fontfile='C\:/Windows/Fonts/georgia.ttf':fontsize=80:fontcolor=0x9F1239:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,4.42,5.15)':alpha='if(lt(t-4.42,0.05),(t-4.42)/0.05,if(gt(t,5.05),1-(t-5.05)/0.1,1))',
drawtext=text='Her name is':fontfile='C\:/Windows/Fonts/arial.ttf':fontsize=44:fontcolor=0x666666:x=(w-text_w)/2:y=(h-text_h)/2-50:enable='between(t,5.36,6.35)':alpha='if(lt(t-5.36,0.1),(t-5.36)/0.1,1)',
drawtext=text='Sofia.':fontfile='C\:/Windows/Fonts/georgia.ttf':fontsize=120:fontcolor=0x9F1239:x=(w-text_w)/2:y=(h-text_h)/2+30:enable='between(t,5.7,6.35)':alpha='if(lt(t-5.7,0.05),(t-5.7)/0.05,if(gt(t,6.25),1-(t-6.25)/0.1,1))',
drawtext=text='7 reservations tonight':fontfile='C\:/Windows/Fonts/georgia.ttf':fontsize=64:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,6.6,7.95)':alpha='if(lt(t-6.6,0.06),(t-6.6)/0.06,if(gt(t,7.85),1-(t-7.85)/0.1,1))',
drawtext=text='27 guests expected':fontfile='C\:/Windows/Fonts/georgia.ttf':fontsize=64:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,8.25,9.65)':alpha='if(lt(t-8.25,0.06),(t-8.25)/0.06,if(gt(t,9.55),1-(t-9.55)/0.1,1))',
drawtext=text='Zero missed calls.':fontfile='C\:/Windows/Fonts/georgia.ttf':fontsize=84:fontcolor=0x9F1239:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,9.9,10.95)':alpha='if(lt(t-9.9,0.05),(t-9.9)/0.05,if(gt(t,10.85),1-(t-10.85)/0.1,1))',
drawtext=text='WhatsApp.':fontfile='C\:/Windows/Fonts/georgia.ttf':fontsize=88:fontcolor=0x25D366:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,11.2,12.57)':alpha='if(lt(t-11.2,0.05),(t-11.2)/0.05,if(gt(t,12.47),1-(t-12.47)/0.1,1))',
drawtext=text='3 seconds.':fontfile='C\:/Windows/Fonts/georgia.ttf':fontsize=96:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,12.75,13.75)':alpha='if(lt(t-12.75,0.05),(t-12.75)/0.05,if(gt(t,13.65),1-(t-13.65)/0.1,1))',
drawtext=text='While you sleep.':fontfile='C\:/Windows/Fonts/georgia.ttf':fontsize=72:fontcolor=0x666666:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,13.99,14.73)':alpha='if(lt(t-13.99,0.06),(t-13.99)/0.06,if(gt(t,14.63),1-(t-14.63)/0.1,1))',
drawtext=text='Analytics.':fontfile='C\:/Windows/Fonts/georgia.ttf':fontsize=64:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-70:enable='between(t,14.88,19.5)':alpha='if(lt(t-14.88,0.05),(t-14.88)/0.05,if(gt(t,19.3),1-(t-19.3)/0.2,1))',
drawtext=text='Revenue.':fontfile='C\:/Windows/Fonts/georgia.ttf':fontsize=64:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,15.78,19.5)':alpha='if(lt(t-15.78,0.05),(t-15.78)/0.05,if(gt(t,19.3),1-(t-19.3)/0.2,1))',
drawtext=text='No-shows.':fontfile='C\:/Windows/Fonts/georgia.ttf':fontsize=64:fontcolor=0x9F1239:x=(w-text_w)/2:y=(h-text_h)/2+70:enable='between(t,17.07,19.5)':alpha='if(lt(t-17.07,0.05),(t-17.07)/0.05,if(gt(t,19.3),1-(t-19.3)/0.2,1))',
drawtext=text='One dashboard.':fontfile='C\:/Windows/Fonts/georgia.ttf':fontsize=80:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,18.39,19.5)':alpha='if(lt(t-18.39,0.05),(t-18.39)/0.05,if(gt(t,19.4),1-(t-19.4)/0.1,1))',
drawtext=text='5 minutes.':fontfile='C\:/Windows/Fonts/georgia.ttf':fontsize=96:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,19.78,20.92)':alpha='if(lt(t-19.78,0.05),(t-19.78)/0.05,if(gt(t,20.82),1-(t-20.82)/0.1,1))',
drawtext=text='No credit card. No technical knowledge.':fontfile='C\:/Windows/Fonts/arial.ttf':fontsize=36:fontcolor=0x666666:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,21.04,23.0)':alpha='if(lt(t-21.04,0.08),(t-21.04)/0.08,if(gt(t,22.9),1-(t-22.9)/0.1,1))',
drawtext=text='Seatable.':fontfile='C\:/Windows/Fonts/georgia.ttf':fontsize=120:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-60:enable='between(t,23.27,28.5)':alpha='if(lt(t-23.27,0.15),(t-23.27)/0.15,1)',
drawtext=text='Your AI host that never misses.':fontfile='C\:/Windows/Fonts/arial.ttf':fontsize=36:fontcolor=0x888888:x=(w-text_w)/2:y=(h-text_h)/2+30:enable='between(t,24.06,28.5)':alpha='if(lt(t-24.06,0.15),(t-24.06)/0.15,1)',
drawtext=text='Try it free.':fontfile='C\:/Windows/Fonts/arial.ttf':fontsize=32:fontcolor=0x9F1239:x=(w-text_w)/2:y=(h-text_h)/2+100:enable='between(t,26.0,28.5)':alpha='if(lt(t-26.0,0.12),(t-26.0)/0.12,1)',
drawtext=text='seatable.one':fontfile='C\:/Windows/Fonts/arial.ttf':fontsize=26:fontcolor=0x555555:x=(w-text_w)/2:y=(h-text_h)/2+150:enable='between(t,27.0,28.5)':alpha='if(lt(t-27.0,0.12),(t-27.0)/0.12,1)'
"

# Remove newlines from filter
FILTER=$(echo "$FILTER" | tr '\n' ' ' | sed 's/  */ /g')

ffmpeg -y -f lavfi -i "color=c=0x0a0908:s=1080x1920:d=${DUR}:r=30" \
  -vf "$FILTER" \
  -c:v libx264 -crf 18 -pix_fmt yuv420p -r 30 \
  "$OUT/kinetic-video.mp4" 2>/dev/null

echo "✅ Video rendered"

echo "Combining with voiceover..."
ffmpeg -y -i "$OUT/kinetic-video.mp4" -i "$VO" \
  -c:v copy -c:a aac -b:a 192k -shortest \
  -movflags +faststart \
  "$OUT/seatable-kinetic-reel.mp4" 2>/dev/null

echo ""
echo "✅ DONE!"
ls -lh "$OUT/seatable-kinetic-reel.mp4"
