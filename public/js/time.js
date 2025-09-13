(() => {
  const sec = document.getElementById('flashSale');
  if (!sec) return;

  // icon Lucide
  if (window.lucide) window.lucide.createIcons();

  const $h = sec.querySelector('#fsHour');
  const $m = sec.querySelector('#fsMin');
  const $s = sec.querySelector('#fsSec');

  // deadline: lấy từ data-deadline (ISO) hoặc mặc định cuối ngày hôm nay
  let dl = sec.dataset.deadline ? new Date(sec.dataset.deadline) : null;
  if (!dl || isNaN(dl)) { dl = new Date(); dl.setHours(23,59,59,999); }

  const pad = n => String(n).padStart(2, '0');

  function tick(){
    const now = new Date();
    let ms = dl - now;
    if (ms < 0) ms = 0;

    const totalSec = Math.floor(ms / 1000);
    const hrs  = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;

    $h.textContent = pad(hrs);
    $m.textContent = pad(mins);
    $s.textContent = pad(secs);

    if (ms === 0) clearInterval(timer);
  }

  const timer = setInterval(tick, 1000);
  tick();
})();
