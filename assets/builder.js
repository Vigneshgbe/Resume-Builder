/* ============================================
   Resume Builder — core engine (v2)
   TinyMCE-backed rich text on every content
   field. Data model stores HTML for rich
   fields, plain strings for single-line fields.
   ============================================ */

(function () {
  'use strict';

  var STORAGE_KEY = 'resumeBuilderData_v2';

  var DEFAULT_DATA = {
    template: 'classic',
    name: '',
    title: '',
    email: '',
    phone: '',
    location: '',
    link: '',
    summary: '',        // HTML
    skills: '',         // HTML
    languages: '',      // HTML
    achievements: '',   // HTML
    interests: '',      // HTML
    experience: [],      // [{role, company, dates, description(HTML)}]
    education: []        // [{degree, school, year}]
  };

  var data = loadData();

  // ---------- persistence ----------

  function loadData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return migrateOrDefault();
      var parsed = JSON.parse(raw);
      return Object.assign(clone(DEFAULT_DATA), parsed);
    } catch (e) {
      console.warn('Could not read saved resume, starting fresh.', e);
      return clone(DEFAULT_DATA);
    }
  }

  // If someone has data saved under the old v1 (plain-CSV) key, bring it
  // forward so upgrading doesn't wipe their draft. CSV values become
  // simple <p> text; TinyMCE opens them as plain text on first load.
  function migrateOrDefault() {
    try {
      var oldRaw = localStorage.getItem('resumeBuilderData_v1');
      if (!oldRaw) return clone(DEFAULT_DATA);
      var old = JSON.parse(oldRaw);
      var fresh = clone(DEFAULT_DATA);
      ['template', 'name', 'title', 'email', 'phone', 'location', 'link'].forEach(function (k) {
        if (old[k]) fresh[k] = old[k];
      });
      ['summary', 'skills', 'languages', 'achievements', 'interests'].forEach(function (k) {
        if (old[k]) fresh[k] = '<p>' + escapeHTML(old[k]) + '</p>';
      });
      if (Array.isArray(old.experience)) {
        fresh.experience = old.experience.map(function (e) {
          return { role: e.role || '', company: e.company || '', dates: e.dates || '', description: e.description ? '<p>' + escapeHTML(e.description) + '</p>' : '' };
        });
      }
      if (Array.isArray(old.education)) fresh.education = old.education;
      return fresh;
    } catch (e) {
      return clone(DEFAULT_DATA);
    }
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      flashSaveStatus('Saved to this browser');
    } catch (e) {
      flashSaveStatus('Could not save (storage full or blocked)', true);
    }
  }

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  var saveStatusTimer;
  function flashSaveStatus(msg, isError) {
    var el = document.getElementById('saveStatus');
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? 'var(--rust)' : 'var(--green)';
    clearTimeout(saveStatusTimer);
  }

  // ---------- init from URL (template=) ----------

  function initTemplateFromURL() {
    var params = new URLSearchParams(window.location.search);
    var t = params.get('template');
    if (t && ['classic', 'modern', 'compact', 'executive'].indexOf(t) !== -1) {
      data.template = t;
    }
  }

  // ---------- simple single-line fields ----------

  var simpleFieldMap = {
    'f-name': 'name',
    'f-title': 'title',
    'f-email': 'email',
    'f-phone': 'phone',
    'f-location': 'location',
    'f-link': 'link'
  };

  function populateSimpleFields() {
    Object.keys(simpleFieldMap).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = data[simpleFieldMap[id]] || '';
    });
    var switcher = document.getElementById('templateSwitch');
    if (switcher) switcher.value = data.template;
  }

  function bindSimpleFields() {
    Object.keys(simpleFieldMap).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', function () {
        data[simpleFieldMap[id]] = el.value;
        render();
        saveData();
      });
    });
  }

  // ---------- TinyMCE rich text fields ----------
  // Toolbar kept intentionally small: bold, italic, bullet/numbered
  // lists, and undo/redo. Resumes need emphasis and lists, not fonts,
  // colors, tables, or images — those actively hurt ATS parsing.

  var RTE_TOOLBAR = 'bold italic | bullist numlist | removeformat | undo redo';
  var RTE_TOOLBAR_SHORT = 'bold italic | bullist | removeformat';

  function initTinyOn(selectorId, toolbar, onChange) {
    var el = document.getElementById(selectorId);
    if (!el) return;
    tinymce.init({
      selector: '#' + selectorId,
      license_key: 'gpl',
      menubar: false,
      statusbar: false,
      toolbar: toolbar,
      plugins: 'lists',
      placeholder: el.getAttribute('data-placeholder') || '',
      branding: false,
      resize: true,
      min_height: 110,
      content_style: 'body { font-family: Inter, sans-serif; font-size: 14px; color: #1B1F23; } ul,ol { padding-left: 20px; margin: 0; }',
      setup: function (editor) {
        editor.on('init', function () {
          editor.setContent(el.getAttribute('data-initial') || '');
        });
        editor.on('input change undo redo keyup', function () {
          onChange(editor.getContent());
        });
      }
    });
  }

  function initRepeatRowTiny(textarea, onChange) {
    var id = textarea.id;
    tinymce.init({
      selector: '#' + id,
      license_key: 'gpl',
      menubar: false,
      statusbar: false,
      toolbar: RTE_TOOLBAR_SHORT,
      plugins: 'lists',
      placeholder: textarea.getAttribute('data-placeholder') || '',
      branding: false,
      resize: true,
      min_height: 90,
      content_style: 'body { font-family: Inter, sans-serif; font-size: 14px; color: #1B1F23; } ul,ol { padding-left: 20px; margin: 0; }',
      setup: function (editor) {
        editor.on('init', function () {
          editor.setContent(textarea.getAttribute('data-initial') || '');
        });
        editor.on('input change undo redo keyup', function () {
          onChange(editor.getContent());
        });
      }
    });
  }

  function initAllTiny() {
    var fields = [
      { id: 'f-summary', key: 'summary', toolbar: RTE_TOOLBAR },
      { id: 'f-skills', key: 'skills', toolbar: RTE_TOOLBAR_SHORT },
      { id: 'f-languages', key: 'languages', toolbar: RTE_TOOLBAR_SHORT },
      { id: 'f-achievements', key: 'achievements', toolbar: RTE_TOOLBAR_SHORT },
      { id: 'f-interests', key: 'interests', toolbar: RTE_TOOLBAR_SHORT }
    ];
    fields.forEach(function (f) {
      var el = document.getElementById(f.id);
      if (!el) return;
      el.setAttribute('data-initial', data[f.key] || '');
      initTinyOn(f.id, f.toolbar, function (html) {
        data[f.key] = html;
        render();
        saveData();
      });
    });
  }

  // ---------- repeatable rows: experience & education ----------

  var rteRowCounter = 0;

  function renderRepeatSection(kind, containerId, templateId, fields) {
    var container = document.getElementById(containerId);
    var tpl = document.getElementById(templateId);

    // Remove any TinyMCE instances currently bound inside this container
    // before wiping the DOM, so we don't leak editor instances.
    container.querySelectorAll('textarea.rte').forEach(function (ta) {
      if (window.tinymce && tinymce.get(ta.id)) tinymce.get(ta.id).remove();
    });

    container.innerHTML = '';
    data[kind].forEach(function (item, index) {
      var node = tpl.content.cloneNode(true);
      var row = node.querySelector('[data-row]');
      var pendingRte = [];

      fields.forEach(function (field) {
        var input = row.querySelector('[data-field="' + field + '"]');
        if (!input) return;
        if (input.tagName === 'TEXTAREA' && input.classList.contains('rte')) {
          rteRowCounter += 1;
          var uid = 'rte-row-' + kind + '-' + index + '-' + rteRowCounter;
          input.id = uid;
          input.setAttribute('data-initial', item[field] || '');
          pendingRte.push({ input: input, field: field });
        } else {
          input.value = item[field] || '';
          input.addEventListener('input', function () {
            data[kind][index][field] = input.value;
            render();
            saveData();
          });
        }
      });

      row.querySelector('[data-remove]').addEventListener('click', function () {
        data[kind].splice(index, 1);
        renderRepeatSection(kind, containerId, templateId, fields);
        render();
        saveData();
      });

      container.appendChild(row);

      // Only initialize TinyMCE after the row is attached to the live
      // document — TinyMCE queries the DOM by selector at init time and
      // will not find (or will misbehave on) a detached node.
      pendingRte.forEach(function (p) {
        (function (kindClosure, indexClosure, fieldClosure, inputEl) {
          initRepeatRowTiny(inputEl, function (html) {
            data[kindClosure][indexClosure][fieldClosure] = html;
            render();
            saveData();
          });
        })(kind, index, p.field, p.input);
      });
    });
  }

  function addRow(kind) {
    if (kind === 'experience') {
      data.experience.push({ role: '', company: '', dates: '', description: '' });
      renderRepeatSection('experience', 'experienceList', 'experienceRowTpl', ['role', 'company', 'dates', 'description']);
    } else if (kind === 'education') {
      data.education.push({ degree: '', school: '', year: '' });
      renderRepeatSection('education', 'educationList', 'educationRowTpl', ['degree', 'school', 'year']);
    }
    render();
    saveData();
  }

  function renderAllRepeatSections() {
    renderRepeatSection('experience', 'experienceList', 'experienceRowTpl', ['role', 'company', 'dates', 'description']);
    renderRepeatSection('education', 'educationList', 'educationRowTpl', ['degree', 'school', 'year']);
  }

  // ---------- resume live preview ----------
  // All templates share one DOM order: Name/Title -> Contact ->
  // Summary -> Skills -> Experience -> Education -> Languages ->
  // Achievements -> Interests. Single column throughout — no grid or
  // flex splitting of content into side-by-side blocks. Rich-text
  // fields are inserted as sanitized HTML (TinyMCE output only ever
  // contains the plugins we enabled: bold, italic, lists).

  function escapeHTML(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function isEmptyRich(html) {
    if (!html) return true;
    var stripped = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim();
    return stripped.length === 0;
  }

  function richBlock(html) {
    return isEmptyRich(html) ? '' : html;
  }

  function contactPieces() {
    return [data.email, data.phone, data.location, data.link].filter(Boolean);
  }

  function experienceHTML() {
    var withContent = data.experience.filter(function (e) { return e.role || e.company || e.dates || !isEmptyRich(e.description); });
    if (!withContent.length) return '<p class="r-empty">No experience added yet</p>';
    return withContent.map(function (e) {
      return '<div class="r-entry">' +
        '<div class="r-entry-head"><span>' + escapeHTML(e.role || 'Role') + (e.company ? ', ' + escapeHTML(e.company) : '') + '</span>' +
        '<span>' + escapeHTML(e.dates) + '</span></div>' +
        (isEmptyRich(e.description) ? '' : '<div class="r-entry-body r-rich">' + richBlock(e.description) + '</div>') +
        '</div>';
    }).join('');
  }

  function educationHTML() {
    var withContent = data.education.filter(function (ed) { return ed.degree || ed.school || ed.year; });
    if (!withContent.length) return '<p class="r-empty">No education added yet</p>';
    return withContent.map(function (ed) {
      return '<div class="r-entry">' +
        '<div class="r-entry-head"><span>' + escapeHTML(ed.degree || 'Degree') + '</span><span>' + escapeHTML(ed.year) + '</span></div>' +
        (ed.school ? '<div class="r-entry-sub">' + escapeHTML(ed.school) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  function sectionBlock(title, innerHTML, skip) {
    if (skip) return '';
    return '<div class="r-section"><div class="r-section-title">' + title + '</div>' + innerHTML + '</div>';
  }

  function buildResumeHTML() {
    var contact = contactPieces().map(function (c) { return '<span>' + escapeHTML(c) + '</span>'; }).join('');
    return (
      '<div class="r-head">' +
        '<div class="r-name">' + (escapeHTML(data.name) || 'Your Name') + '</div>' +
        '<div class="r-title">' + escapeHTML(data.title || 'Your job title') + '</div>' +
        '<div class="r-contact">' + (contact || '<span class="r-empty">Add your contact details</span>') + '</div>' +
      '</div>' +
      '<hr class="r-divider">' +
      sectionBlock('Summary', '<div class="r-rich">' + richBlock(data.summary) + '</div>', isEmptyRich(data.summary)) +
      sectionBlock('Skills', isEmptyRich(data.skills) ? '<p class="r-empty">Not added yet</p>' : '<div class="r-rich r-skills-rich">' + data.skills + '</div>') +
      sectionBlock('Experience', experienceHTML()) +
      sectionBlock('Education', educationHTML()) +
      sectionBlock('Languages', '<div class="r-rich r-skills-rich">' + richBlock(data.languages) + '</div>', isEmptyRich(data.languages)) +
      sectionBlock('Achievements', '<div class="r-rich">' + richBlock(data.achievements) + '</div>', isEmptyRich(data.achievements)) +
      sectionBlock('Interests', '<div class="r-rich r-skills-rich">' + richBlock(data.interests) + '</div>', isEmptyRich(data.interests))
    );
  }

  function render() {
    var paper = document.getElementById('resumePaper');
    paper.className = 'resume-paper template-' + data.template;
    paper.innerHTML = buildResumeHTML();
  }

  // ---------- PDF export ----------

  function downloadPDF() {
    var paper = document.getElementById('resumePaper');
    var name = (data.name || 'resume').trim().replace(/\s+/g, '-').toLowerCase();
    var opt = {
      margin: 0,
      filename: name + '.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' }
    };
    var btn = document.getElementById('downloadBtn');
    var originalLabel = btn.textContent;
    btn.textContent = 'Preparing…';
    btn.disabled = true;
    html2pdf().set(opt).from(paper).save().then(function () {
      btn.textContent = originalLabel;
      btn.disabled = false;
      showToast('Resume downloaded');
    }).catch(function () {
      btn.textContent = originalLabel;
      btn.disabled = false;
      showToast('Something went wrong generating the PDF. Try again.', true);
    });
  }

  var toastTimer;
  function showToast(msg, isError) {
    var toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.style.background = isError ? 'var(--rust)' : 'var(--ink)';
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2600);
  }

  // ---------- mobile form/preview toggle ----------

  function initMobileToggle() {
    var toggle = document.getElementById('previewToggle');
    var body = document.body;
    if (!toggle) return;
    toggle.addEventListener('click', function () {
      var showingPreview = body.classList.toggle('show-preview');
      toggle.textContent = showingPreview ? 'Edit' : 'Preview';
      toggle.setAttribute('aria-pressed', showingPreview ? 'true' : 'false');
      if (showingPreview) window.scrollTo(0, 0);
    });
  }

  // ---------- wire up ----------

  function init() {
    initTemplateFromURL();
    populateSimpleFields();
    bindSimpleFields();
    renderAllRepeatSections();
    render();
    saveData();
    initMobileToggle();

    document.querySelectorAll('[data-add]').forEach(function (btn) {
      btn.addEventListener('click', function () { addRow(btn.getAttribute('data-add')); });
    });

    document.getElementById('templateSwitch').addEventListener('change', function (e) {
      data.template = e.target.value;
      render();
      saveData();
    });

    document.getElementById('downloadBtn').addEventListener('click', downloadPDF);

    document.getElementById('clearBtn').addEventListener('click', function () {
      if (!window.confirm('Clear every field? This cannot be undone.')) return;
      var keepTemplate = data.template;
      data = clone(DEFAULT_DATA);
      data.template = keepTemplate;
      populateSimpleFields();
      renderAllRepeatSections();
      ['f-summary', 'f-skills', 'f-languages', 'f-achievements', 'f-interests'].forEach(function (id) {
        if (window.tinymce && tinymce.get(id)) tinymce.get(id).setContent('');
      });
      render();
      saveData();
      showToast('All fields cleared');
    });

    // TinyMCE loads from CDN asynchronously; poll briefly until the
    // global is available, then initialize every rich text field.
    var tries = 0;
    var waitForTiny = setInterval(function () {
      tries += 1;
      if (window.tinymce) {
        clearInterval(waitForTiny);
        initAllTiny();
      } else if (tries > 100) {
        clearInterval(waitForTiny);
        console.warn('TinyMCE failed to load from CDN; rich text editing unavailable this session.');
      }
    }, 50);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
