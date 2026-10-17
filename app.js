(() => {
  'use strict';
  const D = window.EPISODE_DATA;
  const app = document.getElementById('app');
  const panel = document.getElementById('panel');
  const audio = document.getElementById('reply-audio');
  const toast = document.getElementById('toast');
  const KEY = 'po-shpalam-2-episode-01:v1:';
  const audioCount = D?.frames?.filter(frame => Boolean(frame.audio)).length || 0;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paths = {
    play:'M8 5v14l11-7z', pause:'M8 5v14M16 5v14', next:'M4 12h15m-6-6 6 6-6 6',
    back:'M20 12H5m6-6-6 6 6 6', close:'m6 6 12 12M6 18 18 6',
    menu:'M4 5h16M4 12h16M4 19h16', book:'M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3zM12 6v16',
    sound:'M3 9h4l5-4v14l-5-4H3zM16 8q5 4 0 8m3-11q8 7 0 14',
    full:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
    settings:'M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
    info:'M12 11v7M12 6v1', mic:'M8 4a4 4 0 0 1 8 0v7a4 4 0 0 1-8 0zM5 10v1a7 7 0 0 0 14 0v-1M12 18v4m-4 0h8',
  };
  const icon = name => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + (paths[name] || paths.menu) + '"/></svg>';
  const button = (action, label, glyph = '', cls = '') => '<button type="button" data-action="' + action + '" class="' + cls + '" aria-label="' + esc(label) + '">' + (glyph ? icon(glyph) : '') + '<span>' + label + '</span></button>';
  const read = key => { try { return JSON.parse(localStorage.getItem(KEY + key) || 'null'); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(KEY + key, JSON.stringify(value)); return true; } catch { return false; } };
  const rawPreferences = read('preferences') || {};
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const settings = {
    motion: typeof rawPreferences.motion === 'boolean' ? rawPreferences.motion : !reducedQuery.matches,
    size: Math.max(17, Math.min(26, Number(rawPreferences.size) || 20)),
    readDelay: Math.max(4, Math.min(40, Number(rawPreferences.readDelay) || 10)),
    sound: rawPreferences.sound === true,
  };
  let position = 0, screen = 'title', auto = false, autoTimer, toastTimer, opener;
  let lastBackdrop = '', lastActor = '', warnedSave = false, mounted = false;
  let restoredEnd = false, audioToken = 0, playingSource = '', maxRead = 0;

  function notify(text) {
    toast.textContent = text; toast.classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 4200);
  }
  function applyPreferences() {
    document.documentElement.dataset.motion = settings.motion ? 'on' : 'off';
    document.documentElement.style.setProperty('--text-size', settings.size + 'px');
    write('preferences', settings);
  }
  function bookmark() {
    return { id:D.id, version:D.version, signature:D.signature, position, end:screen === 'end', maxRead };
  }
  function validBookmark(value) {
    return value && value.id === D.id && value.version === D.version && value.signature === D.signature &&
      Number.isInteger(value.position) && value.position >= 0 && value.position < D.frames.length &&
      typeof value.end === 'boolean';
  }
  function persist() {
    if (!write('position', bookmark()) && !warnedSave) {
      warnedSave = true; notify('Браузер не сохранил позицию. Закладку можно скачать в меню.');
    }
  }
  function stopAudio() {
    audioToken++; audio.pause(); audio.currentTime = 0; playingSource = '';
    updateListenButton();
  }
  function stopAuto() {
    auto = false; clearTimeout(autoTimer); updateControls();
  }
  function actorHTML(title = false) {
    return '<div class="cast ' + (title ? 'cast-title' : '') + '" aria-hidden="true">' + D.actors.map(actor =>
      '<div class="cast-member member-' + actor.id + '" data-actor="' + actor.id + '" style="--actor-color:' + actor.color + '">' +
      '<img src="' + actor.asset + '" alt="" draggable="false"><div class="cast-label"><i></i>' +
      '<span>' + esc(actor.name) + '</span><small>AI-ПЕРСОНАЖ</small></div></div>').join('') + '</div>';
  }
  function backdropHTML(name, title = false) {
    return '<div class="scenery" aria-hidden="true"><div class="backdrop" style="background-image:url(assets/' + name + '.webp)"></div>' +
      '<div class="scene-shade"></div><div class="scene-grain"></div><div class="studio-glow"></div>' + actorHTML(title) + '<div class="desk-shadow"></div></div>';
  }
  function wordmark() { return '<span class="rail-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>ПО ШПАЛАМ <b>2</b></span>'; }
  function durationLabel(seconds) {
    if (!Number.isFinite(seconds)) return 'неизвестна';
    const whole = Math.floor(seconds);
    return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
  }

  function renderTitle() {
    stopAuto(); stopAudio(); screen = 'title'; mounted = false; lastBackdrop = ''; lastActor = '';
    const ready = D.frames.length > 0;
    const hasProgress = position > 0 || restoredEnd;
    app.innerHTML = '<main class="title-screen episode-title">' + backdropHTML('studio-opening', true) +
      '<header class="title-header"><span class="wordmark">' + wordmark() + '</span><span class="edition">ВЫПУСК 01</span></header>' +
      '<section class="title-copy"><p class="eyebrow"><span class="on-air-dot"></span> ВЫПУСК 01 · ' + (ready ? (audioCount ? (D.status === 'complete' && audioCount === D.frames.length ? 'ЗАПИСЬ ГОТОВА' : 'ЧАСТЬ ЗАПИСИ') : 'ПРОБНЫЙ ТЕКСТОВЫЙ БЛОК') : 'ПОДГОТОВКА') + '</p>' +
      '<h1>Нейросети<br><em>заменяют</em><br>программистов<span class="title-rule"></span></h1>' +
      '<p class="title-names">Мэддисон <i>·</i> Хованский <i>·</i> Понасенков</p>' +
      '<p class="title-description">' + (ready ? 'Получено реплик от фанботов: ' + D.frames.length + '<br>Озвучено ' + audioCount + ' из ' + D.frames.length + ' реплик · ' + durationLabel(D.timing.available_measured_audio_seconds) + ' проверенного аудио' : 'Новый разговор ещё не записан.<br>Выпуска для просмотра пока нет.') + '</p>' +
      '<div class="episode-plan" aria-label="Цели выпуска"><div><small>ЦЕЛЬ · НОВОСТИ AI</small><strong>10 <span>минут</span></strong></div><div><small>ЦЕЛЬ · ГЛАВНАЯ ТЕМА</small><strong>30 <span>минут</span></strong></div></div>' +
      '<p class="verified-duration">Подтверждённая длительность: <strong>' + durationLabel(D.timing.measured_episode_seconds) + '</strong></p>' +
      (ready ? '<div class="title-actions">' + button(hasProgress ? 'resume' : 'start', hasProgress ? 'Продолжить просмотр' : (audioCount ? 'Открыть запись' : 'Читать пробный блок'), 'next', 'primary') + (hasProgress ? button('restart', 'Начать с первой реплики', '', 'quiet') : '') + '</div>' : '') +
      '<div class="title-secondary">' + (ready ? button('chapters', 'Темы', 'menu') + button('settings', 'Настройки', 'settings') : '') + button('about', 'О формате', 'info') + '<a href="news.html" target="_blank" rel="noopener" style="font-size:10px;align-self:center">Источники новостей ↗</a></div>' +
      '<p class="title-note">Цель — 40 минут. Фактическое время определяется аудиодорожками.</p></section>' +
      '<footer class="title-footer"><span>ЛИНЕЙНЫЙ ЭФИР · БЕЗ ВЫБОРОВ</span><span>ФАНАТСКАЯ AI-ПАРОДИЯ <i>·</i> НЕ РЕАЛЬНЫЕ ВЫСКАЗЫВАНИЯ</span></footer></main>';
    applyPreferences();
  }
  function mountGame() {
    app.innerHTML = '<main class="game-screen">' + backdropHTML('studio-live') +
      '<header class="game-header"><button class="wordmark" data-action="home" aria-label="Главное меню">' + wordmark() + '</button>' +
      '<button class="chapter-button" data-action="chapters" aria-label="Открыть темы"><span class="chapter-num"></span><span class="chapter-title"></span></button>' +
      '<div class="header-actions">' + button('settings', 'Настройки', 'settings', 'icon-button') + button('fullscreen', 'Полный экран', 'full', 'icon-button') + '</div></header>' +
      '<div class="studio-meta"><span class="live-label"><i></i> AI-СТУДИЯ <b>· ЗАПИСЬ</b></span><span class="chapter-time"></span></div>' +
      '<div class="scene-caption" aria-hidden="true"><span>ТЕМА ЭФИРА</span><h2></h2></div>' +
      '<section class="dialogue" aria-label="Текущая реплика"><header class="dialogue-header"><div class="speaker-block"><span class="speaker-lamp"></span><div><span class="speaker-name"></span><span class="speaker-kind"></span></div></div>' +
      '<div class="dialogue-tags"><span class="record-number"></span>' + button('context', 'Переданный контекст', 'info', 'context-button') + '</div></header>' +
      '<div class="text-scroll" tabindex="0" aria-label="Текст текущего экрана"><p class="dialogue-text" aria-live="polite" aria-atomic="true"></p><details class="fact-note" hidden><summary>Проверка факта</summary><p></p></details></div>' +
      '<div class="dialogue-bottom"><div class="reading-hint"><kbd>ПРОБЕЛ</kbd><span>ИЛИ →</span></div>' + button('listen', 'Слушать реплику', 'play', 'listen-button') +
      '<span class="scroll-hint">Текст ниже ↓</span>' + button('next', 'Далее', 'next', 'next-button') + '</div></section>' +
      '<footer class="game-footer"><div class="footer-left">' + button('back', 'Назад', 'back') + button('history', 'История', 'book') + button('chapters', 'Темы', 'menu') + '</div>' +
      '<div class="progress-group"><span class="screen-counter"></span><div class="progress-line"><i></i></div><span class="episode-label">ОДИН ЭПИЗОД</span></div>' +
      '<div class="footer-right">' + button('auto', 'Авто', 'play') + (audioCount ? button('sound', 'Звук', 'sound') : '') + '</div></footer>' +
      '<span class="persistent-disclosure">ФАНАТСКИЕ AI-БОТЫ · РЕДАКЦИОННАЯ ВЕРСИЯ</span></main>';
    mounted = true;
    app.querySelector('.text-scroll').addEventListener('scroll', updateOverflow);
    app.querySelector('.fact-note').addEventListener('toggle', event => {
      if (event.target.open) stopAuto();
      updateOverflow();
    });
  }
  function renderGame(focus = false) {
    if (!D.frames.length) { renderTitle(); return; }
    screen = 'game'; restoredEnd = false;
    if (!mounted || !app.querySelector('.game-screen')) mountGame();
    const frame = D.frames[position], chapter = D.chapters[frame.chapter], main = app.querySelector('main');
    maxRead = Math.max(maxRead, position);
    main.dataset.speaker = frame.actor || frame.kind;
    main.dataset.frameKind = frame.kind;
    const actor = D.actors.find(item => item.id === frame.actor);
    main.style.setProperty('--speaker-color', actor?.color || '#e0bf8a');
    app.querySelector('.chapter-num').textContent = String(frame.chapter + 1).padStart(2, '0') + ' / ' + String(D.chapters.length).padStart(2, '0');
    app.querySelector('.chapter-title').textContent = chapter.title;
    app.querySelector('.chapter-time').textContent = (frame.phase === 'news' ? 'НОВОСТИ AI' : 'ГЛАВНАЯ ТЕМА') + (Number.isFinite(frame.audioDurationSeconds) ? ' · АУДИО ' + durationLabel(frame.audioDurationSeconds) : '');
    if (lastBackdrop !== frame.backdrop) {
      const bg = app.querySelector('.backdrop');
      bg.style.backgroundImage = 'url("assets/' + frame.backdrop + '.webp")';
      main.classList.remove('scene-enter'); void main.offsetWidth; main.classList.add('scene-enter');
      lastBackdrop = frame.backdrop;
    }
    const caption = app.querySelector('.scene-caption');
    caption.querySelector('h2').textContent = chapter.title;
    caption.classList.toggle('visible', frame.kind !== 'reply');
    app.querySelector('.speaker-name').textContent = frame.speaker;
    app.querySelector('.speaker-kind').textContent = frame.kind === 'reply' ? 'ПАРОДИЙНЫЙ AI-ПЕРСОНАЖ' : 'ПОДВОДКА ОРГАНИЗАТОРА';
    app.querySelector('.record-number').textContent = '#' + String(frame.sourceIndex).padStart(2, '0');
    app.querySelector('[data-action="context"]').hidden = !frame.context;
    app.querySelector('.dialogue-text').textContent = frame.text;
    const factNote = app.querySelector('.fact-note');
    factNote.hidden = !frame.editorialNote;
    factNote.open = false;
    factNote.querySelector('p').textContent = frame.editorialNote || '';
    app.querySelector('.text-scroll').scrollTop = 0;
    app.querySelector('[data-action="back"]').disabled = position === 0;
    const next = app.querySelector('[data-action="next"]');
    const ending = position === D.frames.length - 1;
    next.querySelector('span').textContent = ending ? 'Закончить эфир' : 'Далее';
    next.setAttribute('aria-label', ending ? 'Закончить эфир' : 'Далее');
    app.querySelector('.screen-counter').textContent = String(position + 1).padStart(2, '0') + ' / ' + D.frames.length;
    app.querySelector('.progress-line i').style.width = (position + 1) / D.frames.length * 100 + '%';
    const listen = app.querySelector('[data-action="listen"]');
    listen.hidden = !frame.audio;
    app.querySelector('.reading-hint').classList.toggle('with-audio', Boolean(frame.audio));
    if (frame.actor !== lastActor) {
      main.classList.remove('speaker-enter'); void main.offsetWidth; main.classList.add('speaker-enter');
      lastActor = frame.actor;
    }
    applyPreferences(); updateControls(); updateListenButton(); requestAnimationFrame(updateOverflow);
    if (focus) app.querySelector('.text-scroll').focus({preventScroll:true});
    persist();
    if (frame.audio && settings.sound) playReply();
    scheduleAuto();
  }
  function updateOverflow() {
    const scroller = app.querySelector('.text-scroll');
    const hint = app.querySelector('.scroll-hint');
    if (scroller && hint) hint.hidden = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 22;
  }
  function go(index, focus = false) {
    stopAudio();
    position = Math.max(0, Math.min(D.frames.length - 1, index));
    renderGame(focus);
  }
  function next() {
    if (screen !== 'game' || panel.open) return;
    if (position === D.frames.length - 1) { renderEnd(); return; }
    go(position + 1);
  }
  function back() {
    if (screen !== 'game' || panel.open || position === 0) return;
    stopAuto(); go(position - 1);
  }
  function renderEnd() {
    stopAuto(); stopAudio(); screen = 'end'; mounted = false; restoredEnd = true;
    app.innerHTML = '<main class="end-screen">' + backdropHTML('studio-closing', true) +
      '<section class="end-copy"><p class="eyebrow">ВЫПУСК 01</p><h1>' + (D.status === 'complete' ? 'Конец<br><em>выпуска.</em>' : 'Конец доступной<br><em>записи.</em>') + '</h1>' +
      '<p>Записано реплик: ' + D.frames.length + '.<br>Подтверждённая длительность: ' + durationLabel(D.timing.measured_episode_seconds) + '.</p><div class="end-rule"></div>' +
      '<div class="end-actions">' + button('chapters', 'Вернуться к темам', 'menu', 'primary') + button('history', 'Прочитать разговор', 'book') + button('home', 'В главное меню') + '</div>' +
      '<p class="end-disclosure">Ответы фанатских AI-ботов Character.AI.<br>Не реальные высказывания людей.</p></section></main>';
    persist();
  }
  function updateControls() {
    const a = app.querySelector('[data-action="auto"]'), s = app.querySelector('[data-action="sound"]');
    if (a) {
      a.classList.toggle('active', auto); a.setAttribute('aria-pressed', String(auto));
      a.innerHTML = icon(auto ? 'pause' : 'play') + '<span>Авто</span>';
    }
    if (s) {
      s.classList.toggle('active', settings.sound); s.setAttribute('aria-pressed', String(settings.sound));
      s.setAttribute('aria-label', settings.sound ? 'Выключить звук реплик' : 'Включить звук реплик');
    }
  }
  function scheduleAuto(finishedAudio = false) {
    clearTimeout(autoTimer);
    if (!auto || screen !== 'game' || panel.open || document.hidden || (!audio.paused && !audio.ended)) return;
    const wait = finishedAudio ? 1200 : settings.readDelay * 1000;
    autoTimer = setTimeout(() => {
      const scroller = app.querySelector('.text-scroll');
      if (scroller && scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 22) {
        scroller.scrollBy({top:Math.max(90, scroller.clientHeight * .72), behavior:settings.motion ? 'smooth' : 'instant'});
        scheduleAuto();
      } else next();
    }, wait);
  }
  function updateListenButton() {
    const target = app.querySelector('[data-action="listen"]');
    if (!target) return;
    const active = !audio.paused && !audio.ended;
    target.innerHTML = icon(active ? 'pause' : 'play') + '<span>' + (active ? 'Пауза' : 'Слушать реплику') + '</span>';
    target.setAttribute('aria-label', active ? 'Пауза реплики' : 'Слушать реплику');
  }
  async function playReply() {
    const frame = D.frames[position];
    if (screen !== 'game' || !frame.audio || panel.open) return;
    const token = ++audioToken;
    if (playingSource !== frame.audio) { audio.src = frame.audio; playingSource = frame.audio; }
    if (audio.ended) audio.currentTime = 0;
    try {
      await audio.play();
      if (token !== audioToken) return;
      clearTimeout(autoTimer); updateListenButton();
    } catch {
      if (token === audioToken) { notify('Браузер не запустил файл. Нажмите «Слушать реплику».'); scheduleAuto(); }
    }
  }
  function listen() {
    if (!audio.paused && !audio.ended) { audio.pause(); updateListenButton(); scheduleAuto(); }
    else playReply();
  }
  function toggleSound() {
    if (!audioCount) return;
    settings.sound = !settings.sound; applyPreferences(); updateControls();
    if (!settings.sound) { audio.pause(); updateListenButton(); scheduleAuto(); }
    else if (screen === 'game' && D.frames[position].audio) playReply();
    else notify('Звук включён для реплик с локальной аудиозаписью.');
  }
  audio.addEventListener('play', () => { clearTimeout(autoTimer); updateListenButton(); });
  audio.addEventListener('pause', updateListenButton);
  audio.addEventListener('ended', () => { updateListenButton(); scheduleAuto(true); });
  audio.addEventListener('error', () => { if (playingSource) { audio.pause(); notify('Аудиофайл не удалось открыть. Проверьте папку assets/audio.'); scheduleAuto(); } });

  function openPanel(title, content, wide = false) {
    stopAuto(); audio.pause(); updateListenButton(); opener = document.activeElement;
    panel.className = wide ? 'wide' : '';
    panel.innerHTML = '<header class="panel-header"><div><p class="eyebrow">ПО ШПАЛАМ 2</p><h2 id="panel-title">' + title + '</h2></div>' + button('close', 'Закрыть', 'close', 'icon-button') + '</header><div class="panel-body">' + content + '</div>';
    if (!panel.open) panel.showModal();
  }
  function closePanel() {
    panel.close();
    if (opener?.isConnected) opener.focus({preventScroll:true});
  }
  function chapterPanel() {
    openPanel('Темы выпуска', '<p class="panel-lead">Темы записанных реплик. Порядок разговора сохраняется.</p><div class="chapter-list">' + D.chapters.map(chapter =>
      '<button type="button" class="chapter-card ' + (D.frames[position].chapter === chapter.index ? 'current' : '') + '" data-chapter-jump="' + chapter.index + '">' +
      '<span class="chapter-index">' + String(chapter.index + 1).padStart(2, '0') + '</span><span><strong>' + esc(chapter.title) + '</strong><small>' + (chapter.phase === 'news' ? 'НОВОСТИ AI' : 'ГЛАВНАЯ ТЕМА') + '</small></span>' + icon('next') + '</button>').join('') + '</div>');
  }
  function jumpToChapter(chapter) {
    const index = D.frames.findIndex(frame => frame.chapter === chapter);
    if (index < 0) return;
    stopAuto(); closePanel(); go(index, true);
  }
  function historyPanel() {
    const limit = Math.max(position, maxRead);
    openPanel('История эфира', '<p class="panel-lead">Редакционная речь до последней открытой позиции. Только ответы, полученные от Character.AI.</p><div class="history">' +
      D.frames.slice(0, limit + 1).map((frame, index) => '<article class="history-entry ' + frame.kind + '"><header><strong>' + esc(frame.speaker) + '</strong><small>' +
        (frame.kind === 'reply' ? 'AI-ПЕРСОНАЖ' : 'ПОДВОДКА') + '</small></header><p>' + esc(frame.text) +
        '</p>' + (frame.editorialNote ? '<details class="fact-note"><summary>Проверка факта</summary><p>' + esc(frame.editorialNote) + '</p></details>' : '') + '<button type="button" class="history-jump" data-frame-jump="' + index + '">Открыть экран ' + (index + 1) + ' ↗</button></article>').join('') + '</div>', true);
    panel.querySelector('.panel-body').scrollTop = panel.querySelector('.panel-body').scrollHeight;
  }
  function contextPanel() {
    const frame = D.frames[position];
    if (!frame.context) return;
    openPanel('Переданный контекст', '<p class="panel-lead">Входное сообщение отделено от ответа персонажа.</p><div class="context-text">' + esc(frame.context) + '</div><p><a href="' + esc(frame.sourceUrl) + '" target="_blank" rel="noopener">Чат-источник ↗</a></p>', true);
  }
  function aboutPanel() {
    openPanel('Выпуск 01 · формат', '<p class="about-intro">Нейросети заменяют программистов.</p>' +
      '<p>План: около 10 минут на новости AI и 30 минут на главную тему. Это <strong>целевой объём</strong>, а не записанный хронометраж.</p>' +
      '<p>' + (D.frames.length ? 'Доступно ' + D.frames.length + ' ответов фанатских / пародийных ботов Character.AI.' : '<strong>Разговор ещё не записан.</strong> В источнике нет реплик и аудиозаписей.') + ' Движок воспроизводит данные и не сочиняет диалог.</p>' +
      '<p>Подтверждённая длительность выпуска: <strong>' + durationLabel(D.timing.measured_episode_seconds) + '</strong>. Время вычисляется только по готовым проверенным аудиофайлам. Длина текста в этот расчёт не входит.</p>' +
      (audioCount ? '<p>Подключено ' + audioCount + ' локальных записей; длительность измерена для ' + D.timing.measured_clip_count + '. Сумма измеренных дорожек: ' + durationLabel(D.timing.available_measured_audio_seconds) + '.</p>' : '') +
      '<p>Здесь три фанатских AI-персонажа, без внешнего рассказчика и выборов. Их речь не является реальными высказываниями людей, чьи имена они используют.</p>' +
      (D.sources.length ? '<div class="about-sources">' + D.sources.map(source => '<p><strong>' + esc(source.character) + '</strong><a href="' + esc(source.chat_url) + '" target="_blank" rel="noopener">Чат-источник ↗</a></p>').join('') + '</div>' : '') +
      '<p class="protocol-link"><a href="source.json" download>Исходные данные JSON</a> · <a href="source.schema.json" download>Схема данных</a></p>');
  }
  function settingsPanel() {
    openPanel('Настроить чтение', '<div class="setting"><label for="font-size">Размер текста <output id="size-output">' + settings.size + ' px</output></label><input id="font-size" type="range" min="17" max="26" value="' + settings.size + '"></div>' +
      '<div class="setting"><label for="read-delay">Пауза чтения без аудио <output id="delay-output">' + settings.readDelay + ' с</output></label><input id="read-delay" type="range" min="4" max="40" value="' + settings.readDelay + '"><small>Настройка автопоказа; не длительность реплики. При воспроизведении автопоказ ждёт конца файла. Меню и скрытие вкладки останавливают автопоказ.</small></div>' +
      '<label class="toggle-setting"><span>Движение и переходы<small>Свет, плавное появление и движение портретов</small></span><input id="motion-setting" type="checkbox" ' + (settings.motion ? 'checked' : '') + '></label>' +
      (audioCount ? '<label class="toggle-setting"><span>Звук реплик<small>Воспроизводить доступные локальные аудиозаписи при переходе</small></span><input id="sound-setting" type="checkbox" ' + (settings.sound ? 'checked' : '') + '></label>' : '') +
      '<div class="save-section"><h3>Закладка</h3><p>Позиция сохраняется в этом браузере. Файл закладки можно перенести на другое устройство вместе с демкой.</p><div>' +
      button('export', 'Скачать закладку') + button('import', 'Загрузить закладку') + '</div><input type="file" id="save-file" accept=".json,application/json" hidden></div>' +
      '<p class="keyboard-note">Пробел / → далее · ← назад · Esc меню</p>');
  }
  function restartPanel() {
    openPanel('Начать эфир заново?', '<p>Текущая позиция будет заменена. К любой теме можно вернуться через меню.</p><div class="modal-actions">' + button('confirm-start', 'Войти в студию', 'next', 'primary') + button('close', 'Продолжить чтение') + '</div>');
  }
  function start() { position = 0; maxRead = 0; restoredEnd = false; stopAuto(); stopAudio(); renderGame(true); }
  function resume() { if (restoredEnd) renderEnd(); else renderGame(true); }
  function exportBookmark() {
    const value = bookmark();
    if (screen === 'title') value.end = restoredEnd;
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], {type:'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = 'po-shpalam-2-episode-01-bookmark.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importBookmark(file) {
    if (!file) return;
    try {
      if (file.size > 10000) throw Error('Это не похоже на файл закладки.');
      const value = JSON.parse(await file.text());
      if (!validBookmark(value)) throw Error('Закладка относится к другой версии демки или повреждена.');
      stopAuto(); stopAudio(); position = value.position; maxRead = Number.isInteger(value.maxRead) ? Math.max(position, Math.min(value.maxRead, D.frames.length - 1)) : position;
      restoredEnd = value.end; closePanel();
      if (restoredEnd) renderEnd(); else renderGame(true);
      notify('Закладка загружена.');
    } catch (error) { notify(error.message); }
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { notify('Полный экран недоступен в этом окне.'); }
  }

  document.addEventListener('click', event => {
    const chapter = event.target.closest('button[data-chapter-jump]');
    if (chapter) { jumpToChapter(Number(chapter.dataset.chapterJump)); return; }
    const frame = event.target.closest('button[data-frame-jump]');
    if (frame) { closePanel(); stopAuto(); go(Number(frame.dataset.frameJump), true); return; }
    const control = event.target.closest('button[data-action]');
    if (!control || control.disabled) return;
    const actions = {
      start, resume, next, back, home:renderTitle, close:closePanel, chapters:chapterPanel,
      history:historyPanel, about:aboutPanel, settings:settingsPanel, context:contextPanel,
      restart:restartPanel, 'confirm-start':() => { closePanel(); start(); },
      auto:() => { auto = !auto; updateControls(); scheduleAuto(); },
      listen, sound:toggleSound, fullscreen, export:exportBookmark,
      import:() => panel.querySelector('#save-file')?.click(),
    };
    actions[control.dataset.action]?.();
  });
  panel.addEventListener('input', event => {
    if (event.target.id === 'font-size') {
      settings.size = Number(event.target.value); panel.querySelector('#size-output').textContent = settings.size + ' px'; applyPreferences();
    }
    if (event.target.id === 'read-delay') {
      settings.readDelay = Number(event.target.value); panel.querySelector('#delay-output').textContent = settings.readDelay + ' с'; applyPreferences();
    }
  });
  panel.addEventListener('change', event => {
    if (event.target.id === 'motion-setting') { settings.motion = event.target.checked; applyPreferences(); }
    if (event.target.id === 'sound-setting') { settings.sound = event.target.checked; applyPreferences(); updateControls(); }
    if (event.target.id === 'save-file') importBookmark(event.target.files[0]);
  });
  panel.addEventListener('cancel', event => { event.preventDefault(); closePanel(); });
  panel.addEventListener('click', event => {
    if (event.target !== panel) return;
    const rect = panel.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closePanel();
  });
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing || event.defaultPrevented) return;
    if (panel.open) return;
    if (event.target.closest('input,textarea,select,[contenteditable]')) return;
    if (event.repeat) { if ([' ', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault(); return; }
    if (event.key === 'Escape' && screen !== 'title') { event.preventDefault(); settingsPanel(); return; }
    if (screen !== 'game') return;
    if (event.key === 'ArrowRight') { event.preventDefault(); next(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); back(); }
    else if ((event.code === 'Space' || event.key === ' ') && !event.target.closest('button,a,summary')) { event.preventDefault(); next(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stopAuto(); audio.pause(); } });
  window.addEventListener('pagehide', () => {
    if (!D?.frames?.length) return;
    const saved = bookmark(); if (screen === 'title') saved.end = restoredEnd;
    write('position', saved);
  });
  window.addEventListener('resize', updateOverflow);

  if (!D || !Array.isArray(D.frames) || !D.timing || !Array.isArray(D.chapters)) {
    app.innerHTML = '<main class="loading"><h1>Не удалось открыть эпизод</h1><p>Проверьте, что data.js находится рядом с index.html.</p></main>';
    return;
  }
  const saved = read('position');
  if (validBookmark(saved)) {
    position = saved.position; restoredEnd = saved.end;
    maxRead = Number.isInteger(saved.maxRead) ? Math.max(position, Math.min(saved.maxRead, D.frames.length - 1)) : position;
  }
  applyPreferences(); renderTitle();
  ['studio-opening', 'studio-live', 'studio-closing', 'maddyson', 'khovansky', 'ponasenkov'].forEach(name => {
    const image = new Image(); image.src = 'assets/' + name + '.webp';
  });
})();
