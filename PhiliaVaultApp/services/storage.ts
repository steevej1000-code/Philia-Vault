import AsyncStorage from '@react-native-async-storage/async-storage';

// Some native module setups (stale prebuild, missing Pods, SDK mismatches)
// leave AsyncStorage as a lazy proxy whose methods throw synchronously the
// moment a property is accessed (e.g. "Property 'xyz' doesn't exist"),
// rather than rejecting a promise. Guard against both cases so a broken
// native module can never bubble up as an unhandled error in the UI.
class HybridStorage {
  private memoryStore: Record<string, string> = {};

  async getItem(key: string): Promise<string | null> {
    try {
      if (typeof AsyncStorage?.getItem !== 'function') {
        throw new Error('AsyncStorage native module unavailable');
      }
      const val = await AsyncStorage.getItem(key);
      return val;
    } catch (e) {
      console.warn('Fallback storage: AsyncStorage failed, reading from memory', e);
      return this.memoryStore[key] ?? null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (typeof AsyncStorage?.setItem !== 'function') {
        throw new Error('AsyncStorage native module unavailable');
      }
      await AsyncStorage.setItem(key, value);
    } catch (e) {
      console.warn('Fallback storage: AsyncStorage failed, writing to memory', e);
      this.memoryStore[key] = value;
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      if (typeof AsyncStorage?.removeItem !== 'function') {
        throw new Error('AsyncStorage native module unavailable');
      }
      await AsyncStorage.removeItem(key);
    } catch (e) {
      console.warn('Fallback storage: AsyncStorage failed, removing from memory', e);
      delete this.memoryStore[key];
    }
  }
}

export const storage = new HybridStorage();
