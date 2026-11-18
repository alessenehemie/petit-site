// Messages de bonne nuit : ils sont dans le contenu chiffré (textes.js, rubrique « nuit »).
// La liste MESSAGES_NUIT est remplie par script.js quand le bon code est entré.

// ---- Logique du bouton "Bonne nuit" ----
(function () {
  // Date de début fixe alignée sur script.js (15 octobre 2026)
  const START_DATE_NUIT = Date.UTC(2026, 9, 15);

  // Calcule l'index du message de nuit de façon unique chaque jour (exactement comme script.js)
  function dayIndexNuit() {
    const d = new Date();
    const today = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const days = Math.floor((today - START_DATE_NUIT) / 86400000);
    const L = MESSAGES_NUIT.length;
    return ((days % L) + L) % L;
  }

  // Vérifie s'il est au moins 22h ou avant 5h du matin
  function isNightTime() {
    const h = new Date().getHours();
    return h >= 22 || h < 5;
  }

  function render() {
    const el = document.getElementById('nuitText');
    if (!el) return;

    if (!isNightTime()) {
      ecrire(el, "Ma douce Soraya,\n\nIl n'est pas encore 22h 🌙\nReviens ce soir à partir de 22h00 pour lire ton mot de bonne nuit. En attendant, passe une magnifique journée ! 💗");
      return;
    }

    const idx = dayIndexNuit();
    ecrire(el, MESSAGES_NUIT[idx]);
    if (typeof suivre === 'function') suivre('night', idx);
  }

  window.showNight = function () {
    render();
    go('sNuit');
  };

  window.copyNight = function (btn) {
    if (!isNightTime()) return;
    const idx = dayIndexNuit();
    const txt = MESSAGES_NUIT[idx];
    const done = () => {
      if (!btn) return;
      const old = btn.textContent;
      btn.textContent = 'Copié ✅';
      setTimeout(() => (btn.textContent = old), 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, done);
    } else {
      done();
    }
  };
})();