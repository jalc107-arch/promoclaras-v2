const THEMES = {
  christmas: {
    id: "christmas",
    background: "#071b16",
    surface: "#123b2d",
    primary: "#e11d48",
    accent: "#f4c95d",
    text: "#fffdf5"
  },
  money: {
    id: "money",
    background: "#071a12",
    surface: "#123524",
    primary: "#16a34a",
    accent: "#f4c95d",
    text: "#f8fff9"
  },
  automotive: {
    id: "automotive",
    background: "#0b1220",
    surface: "#17233a",
    primary: "#2563eb",
    accent: "#60a5fa",
    text: "#f8fafc"
  },
  minimal: {
    id: "minimal",
    background: "#f1f5f9",
    surface: "#ffffff",
    primary: "#0f172a",
    accent: "#2563eb",
    text: "#0f172a"
  }
};

export function resolveTheme(model, requestedTheme = "automatic", requestedStyle = "premium") {
  let themeId = requestedTheme;

  if (!THEMES[themeId] || themeId === "automatic") {
    const source = `${model.name} ${model.description} ${model.prizeTitle}`.toLowerCase();
    if (/navidad|nochebuena|diciembre|regalo/.test(source)) themeId = "christmas";
    else if (/carro|veh[ií]culo|autom[oó]vil|bmw|moto/.test(source)) themeId = "automotive";
    else if (/dinero|efectivo|mill[oó]n|premio/.test(source)) themeId = "money";
    else themeId = "minimal";
  }

  return {
    ...THEMES[themeId],
    style: ["classic", "premium", "minimal"].includes(requestedStyle)
      ? requestedStyle
      : "premium"
  };
}

export const AVAILABLE_THEMES = ["automatic", "christmas", "money", "automotive", "minimal"];
export const AVAILABLE_STYLES = ["premium", "classic", "minimal"];
