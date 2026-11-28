const video = document.querySelector('#walkthrough video');

// Pages serves the entire MP4 on a byte-range request. A local blob lets the
// native player seek anywhere in this short clip, including on mobile.
const observer = new IntersectionObserver(async ([entry]) => {
  if (!entry.isIntersecting) return;
  observer.disconnect();

  try {
    const response = await fetch(video.src);
    if (!response.ok) return;
    const url = URL.createObjectURL(await response.blob());
    const position = video.currentTime;
    const playing = !video.paused && !video.ended;
    video.src = url;
    if (position) video.currentTime = position;
    if (playing) await video.play();
  } catch {
    // A failed download leaves the direct MP4 available through the controls.
  }
}, { rootMargin: '300px' });

observer.observe(video);
