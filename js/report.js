/* ============================================================
   ANBU BLACK OPS — Shared field-report markup renderer
   ------------------------------------------------------------
   Used by profile.js (member field report) and project.js
   (project report). Renders a small line-based markup language:

     # text          main heading
     ## text         deeper heading
     $ text          second heading
     <p> text        normal paragraph
     - text          bullet point
     1. text         numbered list item
     ---             horizontal rule

     !![align|caption](url)   embedded image. align is one of
                              left | right | center | full.
                              Examples:
                                ![left|Squad photo](data:...)
                                ![full](https://.../img.png)
                              Plain ![caption](url) = centered.

     Inline anywhere: **bold**, *italic*, `code`, [link](url),
     ~~strike~~
   ============================================================ */

(function () {
  function escHtml(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  /* inline formatting only (no image handling) */
  function inlineText(s) {
    return s
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/~~(.+?)~~/g, "<del>$1</del>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  function imageFigure(alt, url) {
    const m = alt.match(/^(left|right|center|full)\|?(.*)$/i);
    const align = m ? m[1].toLowerCase() : "center";
    const caption = m ? m[2] : alt;
    const img =
      '<img src="' + escHtml(url) + '" alt="' + escHtml(caption) + '" loading="lazy" />';
    const figcaption = caption ? "<figcaption>" + inlineText(escHtml(caption)) + "</figcaption>" : "";
    return '<figure class="img-figure img-figure--' + align + '">' + img + figcaption + "</figure>";
  }

  function inline(s) {
    const out = String(s || "").replace(
      /!\[([^\]]*)\]\(([^)\s]+)\)/g,
      (match, alt, url) => imageFigure(alt, url)
    );
    return inlineText(out);
  }

  function renderReport(text) {
    const lines = String(text || "").split("\n");
    const out = [];
    let inList = null;

    const closeList = () => {
      if (inList) {
        out.push("</" + inList + ">");
        inList = null;
      }
    };

    lines.forEach((raw) => {
      const line = raw.trim();
      if (!line) {
        closeList();
        return;
      }

      /* standalone image line */
      if (/^!\[[^\]]*\]\([^)\s]+\)$/.test(line)) {
        closeList();
        out.push(inline(line));
        return;
      }

      if (/^- /.test(line)) {
        if (inList !== "ul") {
          closeList();
          out.push('<ul class="report-list">');
          inList = "ul";
        }
        out.push("<li>" + inline(line.replace(/^- /, "")) + "</li>");
        return;
      }

      if (/^\d+\. /.test(line)) {
        if (inList !== "ol") {
          closeList();
          out.push('<ol class="report-list report-list--ordered">');
          inList = "ol";
        }
        out.push("<li>" + inline(line.replace(/^\d+\. /, "")) + "</li>");
        return;
      }

      closeList();

      if (line === "---") {
        out.push('<hr class="report-rule" />');
      } else if (/^#{2,} /.test(line)) {
        out.push('<h4 class="report-subheading">' + inline(line.replace(/^#{2,} /, "")) + "</h4>");
      } else if (/^# /.test(line)) {
        out.push('<h3 class="report-heading">' + inline(line.replace(/^# /, "")) + "</h3>");
      } else if (/^\$ /.test(line)) {
        out.push('<h4 class="report-subheading">' + inline(line.replace(/^\$ /, "")) + "</h4>");
      } else if (/^<p>/i.test(line)) {
        out.push("<p>" + inline(line.replace(/^<p>/i, "").trim()) + "</p>");
      } else {
        out.push("<p>" + inline(line) + "</p>");
      }
    });

    closeList();
    return out.join("");
  }

  window.Report = {
    escHtml,
    inlineText,
    inline,
    renderReport,
  };
})();
