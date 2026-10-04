// Sistem de design pt. 1.618 — tonurile și scara de spațiere NU sunt
// arbitrare: paleta e caldă/editorial (nu cliseul "SaaS card kit" cu colțuri
// rotunjite identice și umbră gri peste tot), iar scara de spațiere
// urmărește raportul de aur (φ ≈ 1.618) — e literalmente numele brandului,
// nu doar un logo pus deasupra unui layout generic.

export const color = {
  ink: "#1C1410",       // aproape negru, dar cald — text principal, suprafețe închise
  paper: "#FAF6F0",     // fundal, ivoriu cald — nu albul rece, nu cremul clișeic #F4F1EA
  glow: "#C8893B",       // accentul "φ" — chihlimbar cald, folosit rar, doar pt. un singur lucru memorabil per ecran
  glowDeep: "#8A5A24",   // variantă mai închisă a accentului, pt. text/stări apăsate
  moss: "#4B5A45",       // accent secundar, discret — succes/stare pozitivă
  bark: "#6B5D4F",       // text secundar, cald — nu gri rece (#555/#888)
  line: "#E7DFD2",       // linii/separatoare discrete, tot din familia caldă
  danger: "#9B3B2E",     // eroare/anulare — roșu cărămiziu, nu roșu pur de alertă de sistem
};

// Scară de spațiere bazată pe șirul Fibonacci (converge la φ) — folosită
// consecvent în loc de valori arbitrare (12/14/16/24) presărate peste tot.
export const space = { xs: 8, sm: 13, md: 21, lg: 34, xl: 55, xxl: 89 };

export const radius = {
  none: 0,
  sm: 4,     // containere structurale (input-uri, rânduri de listă)
  hero: 28,  // DOAR pt. elementul central al ecranului (preview foto, CTA principal) — raza mare e un semnal, nu decor peste tot
};

export const font = {
  display: "Fraunces_600SemiBold",
  displayItalic: "Fraunces_500Medium_Italic",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemibold: "Inter_600SemiBold",
};

export const type = {
  hero: { fontFamily: font.display, fontSize: 34, lineHeight: 40, color: color.ink },
  h1: { fontFamily: font.display, fontSize: 26, lineHeight: 32, color: color.ink },
  h2: { fontFamily: font.display, fontSize: 20, lineHeight: 26, color: color.ink },
  body: { fontFamily: font.body, fontSize: 16, lineHeight: 23, color: color.ink },
  bodyMuted: { fontFamily: font.body, fontSize: 15, lineHeight: 21, color: color.bark },
  label: { fontFamily: font.bodySemibold, fontSize: 13, lineHeight: 18, color: color.bark },
  button: { fontFamily: font.bodySemibold, fontSize: 16, lineHeight: 20 },
};
