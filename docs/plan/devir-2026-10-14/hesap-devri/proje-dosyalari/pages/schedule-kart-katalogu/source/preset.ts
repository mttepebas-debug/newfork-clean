// This page always opens Schedule (screen 3.0) as the owner, outside the
// PAGES two-frame shell. Imported first, before any module reads the screen.
if (!window.name.startsWith("pages:")) window.name = "pages:s=3.0&sc=owner&frame=solo";
