import { Fragment, ReactNode } from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';

/**
 * Render a translated string that bolds part of itself with <b>…</b>, so the bold part can sit
 * wherever each language puts it:
 *
 *   <Text style={styles.body}>{rich(t('auth.otp.sentTo', { phone }), styles.strong)}</Text>
 *   en 'We sent a 6-digit code to <b>{phone}</b>'
 *
 * Use it inside a <Text>. Only <b> is supported; it must not nest.
 */
export function rich(text: string, boldStyle: StyleProp<TextStyle>): ReactNode {
  const parts = text.split(/<b>(.*?)<\/b>/s);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <Text key={i} style={boldStyle}>
        {part}
      </Text>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}
