/* ============================================
   Resume Builder — core engine
   One data model, one localStorage key,
   three render skins (classic / sidebar / modern)
   ============================================ */

(function () {
  'use strict';

  var STORAGE_KEY = 'resumeBuilderData_v1';

  var DEFAULT_DATA = {
    template: 'classic',
    name: '',
    title: '',
    email: '',
    phone: '',
    location: '',
    link: '',
    summary: '',
    skills: '',
    languages: '',
    achievements: '',
    interests: '',
    experience: [],
    education: []
  };

  var data = loadData();

  // ---------- persistence ----------

  function loadData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return clone(DEFAULT_DATA);
      var parsed = JSON.parse(raw);
      return Object.assign(clone(DEFAULT_DATA), parsed);
    } catch (e) {
      console.warn('Could not read saved resume, starting fresh.', e);
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

  // ---------- form <-> data wiring ----------

  var simpleFieldMap = {
    'f-name': 'name',
    'f-title': 'title',
    'f-email': 'email',
    'f-phone': 'phone',
    'f-location': 'location',
    'f-link': 'link',
    'f-summary': 'summary',
    'f-skills': 'skills',
    'f-languages': 'languages',
    'f-achievements': 'achievements',
    'f-interests': 'interests'
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

  // ---------- repeatable rows: experience & education ----------

  function renderRepeatSection(kind, containerId, templateId, fields) {
    var container = document.getElementById(containerId);
    var tpl = document.getElementById(templateId);
    container.innerHTML = '';
    data[kind].forEach(function (item, index) {
      var node = tpl.content.cloneNode(true);
      var row = node.querySelector('[data-row]');
      fields.forEach(function (field) {
        var input = row.querySelector('[data-field="' + field + '"]');
        input.value = item[field] || '';
        input.addEventListener('input', function () {
          data[kind][index][field] = input.value;
          render();
          saveData();
        });
      });
      row.querySelector('[data-remove]').addEventListener('click', function () {
        data[kind].splice(index, 1);
        renderRepeatSection(kind, containerId, templateId, fields);
        render();
        saveData();
      });
      container.appendChild(row);
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

  function escapeHTML(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function tagList(csv, className) {
    var items = (csv || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!items.length) return '<span class="r-empty">Not added yet</span>';
    return items.map(function (item) {
      return '<span class="' + className + '">' + escapeHTML(item) + '</span>';
    }).join('');
  }

  function contactPieces() {
    return [data.email, data.phone, data.location, data.link].filter(Boolean);
  }

  function experienceHTML() {
    if (!data.experience.length) return '<p class="r-empty">No experience added yet</p>';
    return data.experience.map(function (e) {
      return '<div class="r-entry">' +
        '<div class="r-entry-head"><span>' + escapeHTML(e.role || 'Role') + (e.company ? ', ' + escapeHTML(e.company) : '') + '</span>' +
        '<span>' + escapeHTML(e.dates) + '</span></div>' +
        (e.description ? '<div class="r-entry-body">' + escapeHTML(e.description) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  function educationHTML() {
    if (!data.education.length) return '<p class="r-empty">No education added yet</p>';
    return data.education.map(function (ed) {
      return '<div class="r-entry">' +
        '<div class="r-entry-head"><span>' + escapeHTML(ed.degree || 'Degree') + '</span><span>' + escapeHTML(ed.year) + '</span></div>' +
        (ed.school ? '<div class="r-entry-sub">' + escapeHTML(ed.school) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  // All templates share the exact same DOM order — single column,
  // top to bottom — because that is the only layout every major ATS
  // parses reliably. Visual identity comes from typography, color,
  // and spacing only, never from splitting content into columns.
  //
  // Section order (matches what ATS parsers expect):
  // Name/Title -> Contact -> Summary -> Skills -> Experience ->
  // Education -> Languages -> Achievements -> Interests

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
      sectionBlock('Summary', '<p>' + escapeHTML(data.summary) + '</p>', !data.summary) +
      sectionBlock('Skills', tagList(data.skills, 'r-skill-tag')) +
      sectionBlock('Experience', experienceHTML()) +
      sectionBlock('Education', educationHTML()) +
      sectionBlock('Languages', tagList(data.languages, 'r-skill-tag'), !data.languages) +
      sectionBlock('Achievements', lineList(data.achievements), !data.achievements) +
      sectionBlock('Interests', tagList(data.interests, 'r-skill-tag'), !data.interests)
    );
  }

  function lineList(csv) {
    var items = (csv || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!items.length) return '<p class="r-empty">Not added yet</p>';
    return '<ul class="r-line-list">' + items.map(function (i) { return '<li>' + escapeHTML(i) + '</li>'; }).join('') + '</ul>';
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
    btn.textContent = 'Preparing PDF…';
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

  // ---------- wire up ----------

  function init() {
    initTemplateFromURL();
    populateSimpleFields();
    bindSimpleFields();
    renderAllRepeatSections();
    render();
    saveData();

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
      render();
      saveData();
      showToast('All fields cleared');
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
