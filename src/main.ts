import './style.css';

function greetingFor(h: number): string {
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Good night';
}

const greeting = document.getElementById('greeting')!;
const render = () => {
  greeting.textContent = greetingFor(new Date().getHours());
};

render();
setInterval(render, 60_000);
