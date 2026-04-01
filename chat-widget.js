(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. Configuration
  // ---------------------------------------------------------------------------
  var CFG = window.AGNO_CHAT_CONFIG || {};
  var API_BASE = CFG.apiBase || 'http://localhost:7777';
  var AGENT_ID = CFG.agentId || 'agno-agent';
  var API_KEY = CFG.apiKey || '';
  var BRAND = CFG.brandColor || '#FF4017';
  var BRAND_HOVER = CFG.brandHover || '#e5380f';
  var TITLE = CFG.title || 'Agno Assistant';
  var PLACEHOLDER = CFG.placeholder || 'Ask about Agno...';
  var WELCOME = CFG.welcome || 'Hi! Ask me anything about Agno.';

  // ---------------------------------------------------------------------------
  // 2. State
  // ---------------------------------------------------------------------------
  var STORAGE_KEY = 'agno-chat-history';
  var OPEN_KEY = 'agno-chat-open';
  var SESSION_KEY = 'agno-chat-session';
  var messages = [];
  var sessionId = null;
  var isOpen = false;
  var isLoading = false;
  var abortController = null;

  // ---------------------------------------------------------------------------
  // 3. Load CSS
  // ---------------------------------------------------------------------------
  function loadCSS() {
    var currentScript = document.currentScript || (function () {
      var scripts = document.getElementsByTagName('script');
      return scripts[scripts.length - 1];
    })();
    var cssPath = currentScript && currentScript.src
      ? currentScript.src.replace(/\.js$/, '.css')
      : '/chat-widget.css';
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssPath;
    document.head.appendChild(link);
  }
  loadCSS();

  // ---------------------------------------------------------------------------
  // 4. SVG Icons
  // ---------------------------------------------------------------------------
  var ICON_CHAT = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h10v2H7zm0-3h10v2H7zm0 6h7v2H7z"/></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z"/></svg>';

  // ---------------------------------------------------------------------------
  // 5. Helpers
  // ---------------------------------------------------------------------------
  function el(tag, className, attrs) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (attrs) {
      for (var k in attrs) {
        if (k === 'html') e.innerHTML = attrs[k];
        else if (k === 'text') e.textContent = attrs[k];
        else e.setAttribute(k, attrs[k]);
      }
    }
    return e;
  }

  function renderMarkdown(text) {
    if (!text) return '';
    var html = text
      // Escape HTML
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Code blocks (``` ... ```)
      .replace(/```(\w*)\n?([\s\S]*?)```/g, function (_, lang, code) {
        return '<pre><code>' + code.trim() + '</code></pre>';
      })
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Links [text](url)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      // Line breaks
      .replace(/\n/g, '<br>');
    return html;
  }

  function scrollToBottom(container) {
    requestAnimationFrame(function () {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    });
  }

  function generateSessionId() {
    return 'chat-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  }

  function saveState() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      sessionStorage.setItem(OPEN_KEY, isOpen ? '1' : '0');
      if (sessionId) sessionStorage.setItem(SESSION_KEY, sessionId);
    } catch (e) { /* quota exceeded */ }
  }

  function loadState() {
    try {
      var saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) messages = JSON.parse(saved);
      isOpen = sessionStorage.getItem(OPEN_KEY) === '1';
      sessionId = sessionStorage.getItem(SESSION_KEY) || generateSessionId();
    } catch (e) {
      sessionId = generateSessionId();
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Build DOM
  // ---------------------------------------------------------------------------
  function init() {
    // Hide Mintlify built-in AI if present
    var hideStyle = document.createElement('style');
    hideStyle.textContent = '[data-testid="mintlify-chat"], .mintlify-chat-button { display: none !important; }';
    document.head.appendChild(hideStyle);

    // Root container
    var root = el('div', 'agno-chat-root');

    // -- Bubble button --
    var bubble = el('button', 'agno-chat-bubble', {
      'aria-label': 'Open chat',
      html: ICON_CHAT
    });

    // -- Chat window --
    var win = el('div', 'agno-chat-window');

    // Header
    var header = el('div', 'agno-chat-header');
    var titleWrap = el('div', 'agno-chat-title');
    var dot = el('span', 'agno-chat-title-dot');
    var titleText = el('span', '', { text: TITLE });
    titleWrap.appendChild(dot);
    titleWrap.appendChild(titleText);
    var closeBtn = el('button', 'agno-chat-close', {
      'aria-label': 'Close chat',
      html: ICON_CLOSE
    });
    header.appendChild(titleWrap);
    header.appendChild(closeBtn);

    // Messages area
    var messagesEl = el('div', 'agno-chat-messages');

    // Input area
    var inputArea = el('div', 'agno-chat-input-area');
    var input = el('textarea', 'agno-chat-input', {
      placeholder: PLACEHOLDER,
      rows: '1'
    });
    var sendBtn = el('button', 'agno-chat-send', {
      'aria-label': 'Send message',
      html: ICON_SEND
    });
    inputArea.appendChild(input);
    inputArea.appendChild(sendBtn);

    // Assemble window
    win.appendChild(header);
    win.appendChild(messagesEl);
    win.appendChild(inputArea);

    // Assemble root
    root.appendChild(bubble);
    root.appendChild(win);
    document.body.appendChild(root);

    // -----------------------------------------------------------------------
    // 7. Render
    // -----------------------------------------------------------------------
    function renderMessages() {
      messagesEl.innerHTML = '';
      if (messages.length === 0) {
        var welcomeEl = el('div', 'agno-chat-welcome');
        var iconDiv = el('div', 'agno-chat-welcome-icon', { text: '\uD83E\uDD16' });
        var welcomeText = el('div', '', { text: WELCOME });
        welcomeEl.appendChild(iconDiv);
        welcomeEl.appendChild(welcomeText);
        messagesEl.appendChild(welcomeEl);
        return;
      }
      messages.forEach(function (msg) {
        if (msg.role === 'error') {
          var errEl = el('div', 'agno-chat-error');
          errEl.innerHTML = msg.content + '<br><button class="agno-chat-retry">Retry</button>';
          var retryBtn = errEl.querySelector('.agno-chat-retry');
          retryBtn.addEventListener('click', function () {
            // Remove the error, re-send last user message
            messages = messages.filter(function (m) { return m !== msg; });
            var lastUser = null;
            for (var i = messages.length - 1; i >= 0; i--) {
              if (messages[i].role === 'user') { lastUser = messages[i].content; break; }
            }
            if (lastUser) sendMessage(lastUser, true);
            else renderMessages();
          });
          messagesEl.appendChild(errEl);
        } else {
          var msgEl = el('div', 'agno-chat-msg agno-chat-msg-' + msg.role);
          if (msg.role === 'assistant') {
            msgEl.innerHTML = renderMarkdown(msg.content);
          } else {
            msgEl.textContent = msg.content;
          }
          messagesEl.appendChild(msgEl);
        }
      });

      if (isLoading) {
        var loadEl = el('div', 'agno-chat-loading');
        loadEl.appendChild(el('div', 'agno-chat-dot'));
        loadEl.appendChild(el('div', 'agno-chat-dot'));
        loadEl.appendChild(el('div', 'agno-chat-dot'));
        messagesEl.appendChild(loadEl);
      }

      scrollToBottom(messagesEl);
    }

    function setOpen(open) {
      isOpen = open;
      if (open) {
        win.classList.add('agno-visible');
        bubble.classList.add('agno-open');
        bubble.setAttribute('aria-label', 'Close chat');
        input.focus();
      } else {
        win.classList.remove('agno-visible');
        bubble.classList.remove('agno-open');
        bubble.setAttribute('aria-label', 'Open chat');
      }
      saveState();
    }

    // -----------------------------------------------------------------------
    // 8. API Communication (AgentOS: POST /v1/agents/{agent_id}/runs)
    // -----------------------------------------------------------------------
    function buildEndpoint() {
      return API_BASE.replace(/\/+$/, '') + '/agents/' + encodeURIComponent(AGENT_ID) + '/runs';
    }

    async function sendMessage(text, isRetry) {
      if (!text.trim()) return;

      if (!isRetry) {
        messages.push({ role: 'user', content: text.trim() });
      }

      // Remove any previous error messages
      messages = messages.filter(function (m) { return m.role !== 'error'; });

      isLoading = true;
      renderMessages();
      saveState();
      sendBtn.disabled = true;

      // Build FormData for AgentOS API
      var formData = new FormData();
      formData.append('message', text.trim());
      formData.append('stream', 'true');
      if (sessionId) formData.append('session_id', sessionId);

      abortController = new AbortController();

      var headers = {};
      if (API_KEY) headers['Authorization'] = 'Bearer ' + API_KEY;

      try {
        var response = await fetch(buildEndpoint(), {
          method: 'POST',
          headers: headers,
          body: formData,
          signal: abortController.signal
        });

        if (!response.ok) {
          var errText = '';
          try { errText = await response.text(); } catch (e) {}
          throw new Error('Request failed (' + response.status + ')' + (errText ? ': ' + errText : ''));
        }

        var contentType = response.headers.get('content-type') || '';

        // Streaming SSE response (AgentOS returns event: and data: lines)
        if (response.body && typeof response.body.getReader === 'function' &&
            (contentType.indexOf('text/event-stream') !== -1 || contentType.indexOf('text/plain') !== -1)) {

          messages.push({ role: 'assistant', content: '' });
          isLoading = false;
          renderMessages();

          var reader = response.body.getReader();
          var decoder = new TextDecoder();
          var buffer = '';
          var assistantIdx = messages.length - 1;
          var currentEvent = '';

          while (true) {
            var result = await reader.read();
            if (result.done) break;

            buffer += decoder.decode(result.value, { stream: true });
            var lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (var i = 0; i < lines.length; i++) {
              var line = lines[i];

              // Parse SSE event type
              if (line.startsWith('event:')) {
                currentEvent = line.slice(6).trim();
                continue;
              }

              // Parse SSE data
              if (line.startsWith('data:')) {
                var data = line.slice(5).trim();
                if (data === '[DONE]') continue;

                try {
                  var parsed = JSON.parse(data);

                  // Extract session_id from first event if provided
                  if (parsed.session_id && !sessionId) {
                    sessionId = parsed.session_id;
                  }

                  // Handle AgentOS event types
                  if (currentEvent === 'RunResponse' || currentEvent === 'RunContent' ||
                      currentEvent === 'IntermediateRunContent') {
                    // Content chunks - append to assistant message
                    var content = parsed.content || '';
                    if (typeof content === 'string' && content) {
                      messages[assistantIdx].content += content;
                      renderMessages();
                    }
                  } else if (currentEvent === 'RunCompleted') {
                    // Final response - use content if we haven't accumulated any
                    if (parsed.content && !messages[assistantIdx].content) {
                      messages[assistantIdx].content = typeof parsed.content === 'string'
                        ? parsed.content : JSON.stringify(parsed.content);
                      renderMessages();
                    }
                  } else if (currentEvent === 'RunError') {
                    // Error during run
                    messages.pop(); // remove empty assistant message
                    messages.push({
                      role: 'error',
                      content: parsed.message || parsed.error || 'An error occurred during the run.'
                    });
                    renderMessages();
                    break;
                  } else if (currentEvent === 'ToolCallStarted') {
                    // Optionally show tool usage (skip for cleaner UX)
                  } else if (!currentEvent) {
                    // No event type - try to extract content directly
                    var fallback = parsed.content || parsed.delta || parsed.text || '';
                    if (typeof fallback === 'string' && fallback) {
                      messages[assistantIdx].content += fallback;
                      renderMessages();
                    }
                  }
                } catch (e) {
                  // Non-JSON data line - append as plain text
                  if (data && currentEvent !== 'RunStarted') {
                    messages[assistantIdx].content += data;
                    renderMessages();
                  }
                }

                currentEvent = '';
              }
            }
          }

          // If assistant message is still empty after stream, remove it
          if (messages[assistantIdx] && !messages[assistantIdx].content) {
            messages.splice(assistantIdx, 1);
          }

        } else {
          // Non-streaming JSON response
          var json = await response.json();
          var reply = '';
          if (json.content) {
            reply = typeof json.content === 'string' ? json.content : JSON.stringify(json.content);
          } else if (json.run_response) {
            reply = json.run_response;
          } else {
            reply = JSON.stringify(json);
          }
          if (json.session_id) sessionId = json.session_id;
          messages.push({ role: 'assistant', content: reply });
          isLoading = false;
          renderMessages();
        }
      } catch (err) {
        isLoading = false;
        if (err.name !== 'AbortError') {
          messages.push({
            role: 'error',
            content: 'Failed to get a response. Check your connection and try again.'
          });
        }
        renderMessages();
      } finally {
        sendBtn.disabled = false;
        abortController = null;
        saveState();
      }
    }

    // -----------------------------------------------------------------------
    // 9. Event Handlers
    // -----------------------------------------------------------------------
    bubble.addEventListener('click', function () {
      setOpen(!isOpen);
    });

    closeBtn.addEventListener('click', function () {
      setOpen(false);
    });

    sendBtn.addEventListener('click', function () {
      var text = input.value;
      input.value = '';
      input.style.height = 'auto';
      sendMessage(text);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        var text = input.value;
        input.value = '';
        input.style.height = 'auto';
        sendMessage(text);
      }
    });

    // Auto-grow textarea
    input.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 96) + 'px';
    });

    // Escape to close
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) {
        setOpen(false);
      }
    });

    // -----------------------------------------------------------------------
    // 10. Restore state & initial render
    // -----------------------------------------------------------------------
    loadState();
    renderMessages();
    if (isOpen) {
      // Delay to allow transition
      requestAnimationFrame(function () {
        setOpen(true);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 11. Boot
  // ---------------------------------------------------------------------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
