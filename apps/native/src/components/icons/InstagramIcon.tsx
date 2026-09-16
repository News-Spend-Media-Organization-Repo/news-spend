import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Rect,
  Stop,
} from "react-native-svg";

type Props = {
  size?: number;
};

/**
 * The Instagram glyph: rounded square, ring, and dot.
 *
 * Rebuilt from primitives because the previous version's path data ran far
 * outside its own viewBox — negative coordinates and stray values from a bad
 * conversion — so it rendered as garbage rather than a logo.
 */
export function InstagramIcon({ size = 50 }: Props) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <Defs>
        <LinearGradient id="igGrad" x1="2" x2="22" y1="22" y2="2">
          <Stop offset="0" stopColor="#FEDA75" />
          <Stop offset="0.25" stopColor="#FA7E1E" />
          <Stop offset="0.5" stopColor="#D62976" />
          <Stop offset="0.75" stopColor="#962FBF" />
          <Stop offset="1" stopColor="#4F5BD5" />
        </LinearGradient>
      </Defs>
      <Rect
        height="19"
        rx="5.5"
        stroke="url(#igGrad)"
        strokeWidth="2"
        width="19"
        x="2.5"
        y="2.5"
      />
      <Circle cx="12" cy="12" r="4.75" stroke="url(#igGrad)" strokeWidth="2" />
      <Circle cx="17.4" cy="6.6" fill="url(#igGrad)" r="1.4" />
    </Svg>
  );
}
