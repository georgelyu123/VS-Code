const date = new Date();
document.querySelector('#year').textContent = date.getFullYear();
document.querySelector('#today').textContent = date.toLocaleDateString('en-AU', {
  month: 'long',
  year: 'numeric',
});
