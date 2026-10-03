/* APV 2.2: language and read-aloud support. No changes to question IDs or scoring. */
(() => {
  'use strict';
  const dict = window.APV_EN || {};
  const readSetting = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
  const saveSetting = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
  let lang = readSetting('apv22_language', 'sv') === 'en' ? 'en' : 'sv';
  let rate = Number(readSetting('apv22_speech_rate', '0.9'));
  if (![0.7, 0.9, 1, 1.1].includes(rate)) rate = 0.9;
  const synth = window.speechSynthesis;
  const supported = !!synth && typeof window.SpeechSynthesisUtterance === 'function';
  const originalText = new WeakMap();
  const tr = (sv, en) => lang === 'en' ? en : sv;
  let generation = 0, current = null, paused = false, speaking = false;
  const panel = document.createElement('div');
  panel.className = 'speech-settings';
  panel.innerHTML = `<div class="row"><label>Språk / Language <select id="apvLanguage"><option value="sv">Svenska</option><option value="en">English</option></select></label><label><span id="apvRateLabel"></span> <select id="apvRate"><option value="0.7">0.7×</option><option value="0.9">0.9×</option><option value="1">1×</option><option value="1.1">1.1×</option></select></label><button type="button" id="apvPause" class="secondary" disabled></button><button type="button" id="apvStop" class="secondary" disabled></button></div><p id="apvSpeechStatus" role="status" aria-live="polite"></p>`;
  document.querySelector('header .wrap').appendChild(panel);
  const $ = id => document.getElementById(id);
  $('apvLanguage').value = lang; $('apvRate').value = String(rate);
  function updateControls(message) {
    $('apvRateLabel').textContent = tr('Läshastighet', 'Reading speed');
    $('apvPause').textContent = paused ? tr('Fortsätt', 'Resume') : tr('Pausa', 'Pause');
    $('apvPause').disabled = !speaking;
    $('apvStop').textContent = tr('Stoppa', 'Stop'); $('apvStop').disabled = !speaking;
    $('apvRate').disabled = !supported;
    if (message !== undefined) $('apvSpeechStatus').textContent = message;
    document.querySelectorAll('[data-read-label]').forEach(b => {
      b.textContent = b.dataset.readLabel === 'explanation' ? tr('🔊 Läs upp förklaringen', '🔊 Read explanation') : b.dataset.readLabel === 'chapter' ? tr('🔊 Läs upp kapitlet', '🔊 Read chapter') : tr('🔊 Läs upp frågan och svaren', '🔊 Read question and answers');
      b.disabled = !supported;
    });
  }
  function idleMessage() {
    if (!supported) return tr('Uppläsning stöds inte i den här webbläsaren. Texten går att läsa som vanligt.', 'This browser does not support read-aloud. You can still read the text.');
    const voices = synth.getVoices();
    if (voices.length && !voices.some(v => v.lang.toLowerCase().startsWith(lang))) return tr('Ingen svensk röst hittades. Aktivera en svensk röst på enheten eller använd en annan webbläsare.', 'No English voice was found. Enable an English voice on your device or use another browser.');
    return tr('Tryck på Läs upp vid ett kapitel eller en fråga.', 'Select Read aloud beside a chapter or question.');
  }
  function stop(message) {
    generation++; current = null; paused = false; speaking = false;
    if (supported) synth.cancel();
    updateControls(message === undefined ? idleMessage() : message);
  }
  // Short chunks avoid long-utterance failures and retain sentence boundaries where possible.
  function chunks(text) {
    const parts = text.match(/[^.!?\n]+[.!?]?/g) || [text];
    return parts.flatMap(part => {
      const result = []; let chunk = '';
      for (const word of part.trim().split(/\s+/)) {
        if (chunk.length + word.length > 180 && chunk) { result.push(chunk); chunk = ''; }
        chunk += (chunk ? ' ' : '') + word;
      }
      if (chunk) result.push(chunk); return result;
    });
  }
  function speak(text) {
    stop(); if (!supported || !text.trim()) return;
    const voices = synth.getVoices();
    const matches = voices.filter(v => v.lang.toLowerCase().startsWith(lang));
    if (voices.length && !matches.length) { updateControls(idleMessage()); return; }
    const voice = matches.find(v => v.localService) || matches[0];
    const queue = chunks(text), token = generation;
    let index = 0;
    speaking = true; updateControls(tr('Läser upp…', 'Reading aloud…'));
    function next() {
      if (token !== generation) return;
      if (index >= queue.length) { speaking = false; current = null; updateControls(tr('Uppläsningen är klar.', 'Reading complete.')); return; }
      current = new SpeechSynthesisUtterance(queue[index++]);
      current.lang = lang === 'sv' ? 'sv-SE' : 'en-GB';
      if (voice) current.voice = voice;
      current.rate = rate;
      current.onend = () => { if (token === generation) next(); };
      current.onerror = event => {
        if (token !== generation || event.error === 'canceled' || event.error === 'interrupted') return;
        stop(tr('Ljudet kunde inte spelas. Kontrollera enhetens röst och ljud och tryck Läs upp igen.', 'Audio could not play. Check your device voice and audio settings, then select Read aloud again.'));
      };
      synth.speak(current);
    }
    next();
  }
  function translate(value) {
    const key = value.trim().replace(/\s+/g, ' ');
    if (!key || lang === 'sv') return value;
    let translated = dict[key];
    if (!translated) {
      const count = key.match(/^Fråga (\d+) av (\d+)$/);
      const done = key.match(/^Kapitel (\d+) genomfört ✓$/);
      const feedback = key.match(/^(Rätt\. |Fel\. )(.*)$/);
      const numbered = key.match(/^(\d+\. )(.*)$/);
      const answer = key.match(/^(Ditt svar: |Rätt svar: )(.*)$/);
      if (count) translated = `Question ${count[1]} of ${count[2]}`;
      else if (done) translated = `Chapter ${done[1]} completed ✓`;
      else if (feedback) translated = (feedback[1].startsWith('Rätt') ? 'Correct. ' : 'Incorrect. ') + (dict[feedback[2]] || feedback[2]);
      else if (numbered && dict[numbered[2]]) translated = numbered[1] + dict[numbered[2]];
      else if (answer) translated = (answer[1].startsWith('Ditt') ? 'Your answer: ' : 'Correct answer: ') + (dict[answer[2]] || answer[2]);
    }
    return translated ? value.replace(value.trim(), translated) : value;
  }
  const config = {subtree:true, childList:true, characterData:true};
  const observer = new MutationObserver(records => {
    if (records.some(r => { const el = r.target.nodeType === 1 ? r.target : r.target.parentElement; return el && !el.closest(".speech-settings,.read-controls"); })) refresh();
  });
  function refresh() {
    observer.disconnect();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.parentElement || node.parentElement.closest('script,style,noscript,.speech-settings,.read-controls')) continue;
      let memo = originalText.get(node);
      if (!memo || node.data !== memo.last) memo = {source:node.data};
      const next = translate(memo.source);
      if (node.data !== next) node.data = next;
      memo.last = next; originalText.set(node, memo);
    }
    document.documentElement.lang = lang;
    // Translate training content only; internal question and category values remain stable.
    observer.observe(document.body, config);
    updateControls();
  }
  function textIn(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll('button,input,select,.read-controls,.hidden,script,style').forEach(n => n.remove());
    clone.querySelectorAll('p,li,h2,h3,h4,div').forEach(n => n.appendChild(document.createTextNode('\n')));
    return clone.textContent.trim();
  }
  function addReadButton(target, kind, getText) {
    const wrap = document.createElement('div'); wrap.className = 'read-controls';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary'; button.dataset.readLabel = kind;
    button.addEventListener('click', () => { refresh(); speak(getText()); });
    wrap.appendChild(button); target.appendChild(wrap); return wrap;
  }
  document.querySelectorAll('.lesson').forEach(lesson => {
    const controls = addReadButton(lesson, 'chapter', () => textIn(lesson));
    lesson.insertBefore(controls, lesson.children[2] || null);
  });
  for (const [body, question, answers, feedback] of [['quizBody','question','answers','feedback'],['examBody','examQuestion','examAnswers',null],['weakBody','weakQuestion','weakAnswers','weakFeedback']]) {
    const control = addReadButton($(body), 'question', () => $(question).textContent + '\n' + [...$(answers).querySelectorAll('.answer')].map((b,i) => String.fromCharCode(65+i) + '. ' + b.textContent).join('\n'));
    $(question).after(control);
    if (feedback) {
      // This control is outside feedback text so the original app can freely replace textContent.
      const explanation = addReadButton($(body), 'explanation', () => $(feedback).textContent);
      $(feedback).after(explanation);
      const sync = () => { explanation.hidden = $(feedback).classList.contains('hidden'); };
      new MutationObserver(sync).observe($(feedback), {attributes:true, attributeFilter:['class']}); sync();
    }
  }
  // Review cards exist only after a completed final test.
  const review = $('examReview');
  new MutationObserver(() => {
    review.querySelectorAll('.module').forEach(card => { if (!card.querySelector('.read-controls')) addReadButton(card, 'explanation', () => textIn(card)); });
    updateControls();
  }).observe(review, {childList:true});
  $('apvLanguage').addEventListener('change', e => { stop(); lang = e.target.value; saveSetting('apv22_language', lang); refresh(); updateControls(idleMessage()); });
  $('apvRate').addEventListener('change', e => { rate = Number(e.target.value); saveSetting('apv22_speech_rate', String(rate)); stop(tr('Hastigheten är ändrad. Tryck Läs upp igen.', 'Speed changed. Select Read aloud again.')); });
  $('apvStop').addEventListener('click', () => stop());
  $('apvPause').addEventListener('click', () => {
    if (!speaking) return;
    paused = !paused; if (paused) synth.pause(); else synth.resume();
    updateControls(paused ? tr('Pausad.', 'Paused.') : tr('Läser upp…', 'Reading aloud…'));
  });
  // Stop old speech before any navigation, answer selection, or test action.
  document.addEventListener('click', e => {
    const b = e.target.closest('button,a');
    if (b && !b.closest('.read-controls,.speech-settings')) stop();
  }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', () => stop());
  if (supported) synth.addEventListener('voiceschanged', () => { if (!speaking) updateControls(idleMessage()); });
  refresh(); updateControls(idleMessage());
})();
