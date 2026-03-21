import { tokens } from "./tokens";

const light = {
  ...tokens.color,
  background: "#fff",
  color: "#000",
  borderColor: "#E4E3E3",
  borderColorHover: "#000",
  borderColorPress: "#000",
  borderColorFocus: "#000",
  backgroundHover: "#000",
  backgroundPress: "#f2f2f2",
  backgroundFocus: "#000",
  colorHover: "#000",
  colorPress: "#f2f2f2",
  colorFocus: "#000",
  shadowColor: "#000",
  shadowColorHover: "#000",
  placeholderColor: tokens.color.p300,
  backgroundTransparent: tokens.color.p200,
  shadowColorPress: tokens.color.p100,
  shadowColorFocus: tokens.color.p100,
};

type BaseTheme = typeof light;

const dark: BaseTheme = {
  ...tokens.color,
  background: "#000",
  color: "#fff",
  borderColor: "#E4E3E3",
  borderColorHover: "#000",
  borderColorPress: "#000",
  borderColorFocus: "#000",
  backgroundHover: "#000",
  backgroundPress: "#000",
  backgroundFocus: "#000",
  colorHover: "#000",
  colorPress: "#f2f2f2",
  colorFocus: "#000",
  shadowColor: "#000",
  shadowColorHover: "#000",
  placeholderColor: tokens.color.p300,
  backgroundTransparent: tokens.color.s200,
  shadowColorPress: tokens.color.s100,
  shadowColorFocus: tokens.color.s100,
};

const allThemes = {
  // ...colorThemes,
  light,
  dark,
};

// 2. then get the name type
type ThemeName = keyof typeof allThemes;

// 3. then, create a Themes type that explicitly maps ThemeName => BaseTheme
type Themes = {
  [key in ThemeName]: BaseTheme;
};

// 4. finally, export it with the stricter type
export const themes: Themes = allThemes;
