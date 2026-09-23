import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BASE } from '../theme/palette';
import { t } from '../i18n';

type Props = {
  children: ReactNode;
  /** Optional label for logs */
  name?: string;
  onReset?: () => void;
};

type State = {
  error: Error | null;
};

/**
 * Prevents a single subtree crash (e.g. Skia style bug) from blanking the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn(
      `[ErrorBoundary${this.props.name ? `:${this.props.name}` : ''}]`,
      error.message,
      info.componentStack,
    );
  }

  private reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.wrap}>
          <Text style={styles.title}>{t('sessionRecoverTitle')}</Text>
          <Text style={styles.detail}>{this.state.error.message}</Text>
          <Pressable onPress={this.reset} style={styles.btn}>
            <Text style={styles.btnLabel}>{t('sessionRecoverAction')}</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: BASE.bg,
    zIndex: 50,
  },
  title: {
    color: BASE.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  detail: {
    color: BASE.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  btn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BASE.border,
    backgroundColor: BASE.surface,
  },
  btnLabel: {
    color: BASE.text,
    fontWeight: '700',
    fontSize: 14,
  },
});
