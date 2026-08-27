/// <reference types="chrome" />
import { ChatSiteConfig } from './types';
import { state } from './state';
import { stopSession, playButton, floatingBar } from './floating-ui';

export const VALID_TAGS = new Set(["P", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "SPAN", "A", "TD", "TH", "ARTICLE", "DIV", "FIGCAPTION"]);

export const CHAT_SITE_CONFIGS: ChatSiteConfig[] = [
  {
    domain: "claude.ai",
    messageSelector: "[data-message-author-role], .font-claude-message, .font-user-message, [data-testid='user-message'], .standard-markdown, .prose"
  },
  {
    domain: "chatgpt.com",
    messageSelector: "[data-message-author-role], article, .agent-turn, .user-turn, .markdown"
  },
  {
    domain: "openai.com",
    messageSelector: "[data-message-author-role], article, .agent-turn, .user-turn, .markdown"
  },
  {
    domain: "deepseek.com",
    messageSelector: ".ds-markdown, [data-testid='chat-message']"
  }
];

export function getActiveChatConfig(): ChatSiteConfig | null {
  const hostname = window.location.hostname;
  return CHAT_SITE_CONFIGS.find(cfg => hostname.includes(cfg.domain)) || null;
}

export const AI_DISCLAIMER_REGEX = /(can make mistakes|double[- ]check responses|check important info|is an AI and may make mistakes)/i;

export function isValidTextElement(el: HTMLElement): boolean {
  if (!el || !el.tagName) return false;
  if (!VALID_TAGS.has(el.tagName)) return false;

  const chatConfig = getActiveChatConfig();
  if (chatConfig) {
    if (!el.closest(chatConfig.messageSelector)) {
      return false;
    }
  }

  if (el.closest("fieldset, textarea, [contenteditable='true'], [data-testid*='input'], [data-testid*='disclaimer'], [data-testid*='footer']")) {
    return false;
  }

  const role = el.getAttribute("role");
  if (role && ["button", "menuitem", "tab", "dialog", "navigation", "search", "switch", "checkbox", "radio", "option"].includes(role)) return false;

  let depth = 0;
  let currentEl: HTMLElement | null = el;
  const uiClasses = ["btn", "button", "dropdown", "menu", "nav", "tab", "pill", "badge", "tag", "filter", "pagination", "controls", "profile", "avatar", "author", "metadata", "disclaimer"];
  while (currentEl && currentEl !== document.body && currentEl !== document.documentElement && depth < 4) {
    const classes = currentEl.classList;
    for (let i = 0; i < classes.length; i++) {
      const cls = classes[i].toLowerCase();
      if (uiClasses.some(ui => cls === ui || cls.includes(`-${ui}`) || cls.includes(`${ui}-`))) {
        return false;
      }
    }
    currentEl = currentEl.parentElement;
    depth++;
  }

  if (el.closest("nav, footer, aside, menu, form, button, [role='navigation'], [role='menu'], [role='tablist'], [role='search'], [role='toolbar'], [role='menubar'], [role='dialog'], [role='button'], [role='tab']")) {
    return false;
  }
  
  if (el.tagName === "DIV") {
    const hasBlockChildren = Array.from(el.children).some(child => {
      const tag = child.tagName;
      return ["DIV", "P", "UL", "OL", "TABLE", "SECTION", "ARTICLE", "HEADER", "FOOTER", "BLOCKQUOTE"].includes(tag);
    });
    if (hasBlockChildren) return false;
  }

  const text = el.innerText || el.textContent || "";
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  if (trimmed.length < 160 && AI_DISCLAIMER_REGEX.test(trimmed)) {
    return false;
  }

  const rect = el.getBoundingClientRect();
  if (rect.height > 600) return false;

  const wordCount = trimmed.split(/\s+/).length;
  if (!["H1", "H2", "H3", "H4", "H5", "H6", "P", "LI", "BLOCKQUOTE", "TH", "TD"].includes(el.tagName)) {
    if (wordCount <= 5) {
      const hasPunctuation = /[.!?:]/.test(trimmed);
      if (!hasPunctuation) return false;
    }
    if (rect.height > 150 && wordCount < 15) {
      return false;
    }
  }
  
  if (["DIV", "SPAN", "ARTICLE", "SECTION", "LI"].includes(el.tagName)) {
    const interactiveElements = Array.from(el.querySelectorAll("a, button"));
    let interactiveTextLength = 0;
    for (const child of interactiveElements) {
      interactiveTextLength += ((child as HTMLElement).innerText || child.textContent || "").length;
    }
    if (interactiveTextLength > 0 && interactiveTextLength >= trimmed.length * 0.5) {
      return false;
    }
  }

  const mediaElements = Array.from(el.querySelectorAll("img, video, svg"));
  let totalMediaArea = 0;
  for (const media of mediaElements) {
    const mediaRect = media.getBoundingClientRect();
    totalMediaArea += mediaRect.width * mediaRect.height;
  }
  const elArea = rect.width * rect.height;
  if (elArea > 0 && totalMediaArea > elArea * 0.5) {
    return false;
  }

  return true;
}

export function getClosestValidElement(el: HTMLElement | null): HTMLElement | null {
  let current = el;
  let highestValid: HTMLElement | null = null;
  while (current && current !== document.body && current !== document.documentElement) {
    if (isValidTextElement(current)) {
      highestValid = current;
    } else if (highestValid) {
      break;
    }
    current = current.parentElement;
  }
  return highestValid;
}

export function getFirstValidElement(container: HTMLElement): HTMLElement | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, null);
  let node: Node | null = walker.currentNode;
  while ((node = walker.nextNode())) {
    const el = node as HTMLElement;
    if (isValidTextElement(el)) {
      return el;
    }
  }
  return null;
}

export function getNextValidElement(current: HTMLElement): HTMLElement | null {
  const chatConfig = getActiveChatConfig();
  if (chatConfig) {
    const currentMsg = current.closest(chatConfig.messageSelector) as HTMLElement | null;
    if (currentMsg) {
      let node: Node | null = current;
      function getNextNodeWithin(n: Node, root: Node): Node | null {
        if (n !== current && n.firstChild) return n.firstChild;
        while (n && n !== root) {
          if (n.nextSibling) return n.nextSibling;
          n = n.parentNode as Node;
        }
        return null;
      }

      while ((node = getNextNodeWithin(node, currentMsg))) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          if (isValidTextElement(el)) {
            return el;
          }
        }
      }

      const allMsgs = Array.from(document.querySelectorAll<HTMLElement>(chatConfig.messageSelector));
      const currentIdx = allMsgs.indexOf(currentMsg);
      if (currentIdx !== -1) {
        for (let i = currentIdx + 1; i < allMsgs.length; i++) {
          const nextMsg = allMsgs[i];
          const firstValid = getFirstValidElement(nextMsg);
          if (firstValid) return firstValid;
        }
      }

      return null;
    }
  }

  let node: Node | null = current;
  function getNextNode(n: Node): Node | null {
    if (n !== current && n.firstChild) return n.firstChild;
    while (n) {
      if (n.nextSibling) return n.nextSibling;
      n = n.parentNode as Node;
    }
    return null;
  }

  while ((node = getNextNode(node))) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (isValidTextElement(el)) {
        return el;
      }
    }
  }
  return null;
}

export function extractRawText(el: HTMLElement): string {
  let text = "";
  function traverse(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || "";
    } else {
      for (const child of Array.from(node.childNodes)) {
        traverse(child);
      }
    }
  }
  traverse(el);
  return text;
}

export function createRangeFromOffset(el: HTMLElement, start: number, length: number): Range | null {
  const range = document.createRange();
  let currentOffset = 0;
  let startNode: Node | null = null;
  let startNodeOffset = 0;
  let endNode: Node | null = null;
  let endNodeOffset = 0;

  function traverse(node: Node) {
    if (endNode) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const nodeLen = node.textContent?.length || 0;
      if (!startNode && currentOffset + nodeLen > start) {
        startNode = node;
        startNodeOffset = start - currentOffset;
      }
      if (startNode && currentOffset + nodeLen >= start + length) {
        endNode = node;
        endNodeOffset = start + length - currentOffset;
      }
      currentOffset += nodeLen;
    } else {
      for (const child of Array.from(node.childNodes)) {
        traverse(child);
      }
    }
  }

  traverse(el);

  if (startNode && endNode) {
    try {
      range.setStart(startNode, startNodeOffset);
      range.setEnd(endNode, endNodeOffset);
      return range;
    } catch (e) {
      return null;
    }
  }
  return null;
}

export function checkIgnoredSites(ignoredSites: string[]) {
  const currentUrl = window.location.href;
  const currentDomain = window.location.hostname;
  state.isSiteIgnored = ignoredSites.some((site: string) => {
    return currentUrl.includes(site) || currentDomain.includes(site);
  });
  
  if (state.isSiteIgnored) {
    stopSession();
    if (playButton) playButton.style.display = 'none';
    if (floatingBar) floatingBar.style.display = 'none';
  } else {
    if (playButton) playButton.style.display = 'flex';
    if (floatingBar) floatingBar.style.display = 'flex';
  }
}
