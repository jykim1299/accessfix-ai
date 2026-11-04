// Accept direct DOM focus and the standard composite-widget active-descendant pattern.
// This checks the browser's current focus relationship, not a prescribed implementation.
export function hasSemanticFocus(element) {
 const active=document.activeElement;
 if(active===element)return true;
 if(!active||!['menu','menubar','listbox','tree','grid','treegrid','tablist','combobox','group','application'].includes(active.getAttribute('role')))return false;
 const id=active.getAttribute('aria-activedescendant');
 if(!id||document.getElementById(id)!==element)return false;
 if(active.contains(element))return true;
 const owned=(active.getAttribute('aria-owns')||'').split(/\s+/);
 if(element.id&&owned.includes(element.id))return true;
 return active.getAttribute('role')==='combobox'&&(active.getAttribute('aria-controls')||'').split(/\s+/).some(id=>document.getElementById(id)?.contains(element));
}
