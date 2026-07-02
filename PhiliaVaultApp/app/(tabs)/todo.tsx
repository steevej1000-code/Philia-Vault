import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../services/api';
import { COLORS, RADIUS } from '../../constants/colors';
import { useUserPreferences } from '../../context/UserPreferencesContext';
import { OfflineBanner } from '../../components/OfflineBanner';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

interface TodoTask {
  id: number;
  title: string;
  task_date: string;
  completed: boolean | number;
}

const CACHE_PREFIX = '@philia_todo:';
const LAST_SYNC_KEY = '@philia_todo:last_sync';

export default function TodoScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useUserPreferences();
  const { isOnline } = useNetworkStatus();
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [marked, setMarked] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<string | null>(null);

  // Load last sync timestamp
  useEffect(() => {
    AsyncStorage.getItem(LAST_SYNC_KEY).then(v => setLastSync(v));
  }, []);

  // Save last sync timestamp
  const touchSync = async () => {
    const ts = new Date().toISOString();
    await AsyncStorage.setItem(LAST_SYNC_KEY, ts);
    setLastSync(ts);
  };

  // Cache for a date
  const cacheKey = (date: string) => `${CACHE_PREFIX}tasks_${date}`;
  const cacheMarks = (month: string) => `${CACHE_PREFIX}marks_${month}`;

  const load = useCallback(async () => {
    setLoading(true);
    const month = selectedDate.substring(0, 7);
    try {
      const [tasksRes, countsRes] = await Promise.all([
        api.getTodoTasks(selectedDate),
        api.getTodoTaskCounts(month),
      ]);
      setTasks(tasksRes.tasks || []);
      await AsyncStorage.setItem(cacheKey(selectedDate), JSON.stringify(tasksRes.tasks || []));
      
      const marks: Record<string, any> = {};
      (countsRes.counts || []).forEach((c: any) => {
        marks[c.task_date] = { marked: true, dotColor: '#39FF14' };
      });
      marks[selectedDate] = { ...(marks[selectedDate] || {}), selected: true, selectedColor: '#39FF14' };
      setMarked(marks);
      await AsyncStorage.setItem(cacheMarks(month), JSON.stringify(marks));
      await touchSync();
    } catch {
      // Offline fallback — load from cache
      const cached = await AsyncStorage.getItem(cacheKey(selectedDate));
      if (cached) setTasks(JSON.parse(cached));
      const cachedMarks = await AsyncStorage.getItem(cacheMarks(month));
      if (cachedMarks) setMarked(JSON.parse(cachedMarks));
    }
    setLoading(false);
  }, [selectedDate]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addTask = async () => {
    const t = newTitle.trim();
    if (!t) return;
    try {
      await api.createTodoTask(t, selectedDate);
      setNewTitle('');
      load();
    } catch { Alert.alert('Erreur', 'Création impossible'); }
  };

  const toggle = async (task: TodoTask) => {
    try {
      await api.toggleTodoTask(task.id, !task.completed);
      load();
    } catch { Alert.alert('Erreur', 'Mise à jour impossible'); }
  };

  const remove = (task: TodoTask) => {
    Alert.alert('Supprimer', `"${task.title}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        await api.deleteTodoTask(task.id);
        load();
      }},
    ]);
  };

  const dateLabel = new Date(selectedDate + 'T12:00:00').toLocaleDateString(
    language === 'fr' ? 'fr-FR' : 'en-US',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {!isOnline && <OfflineBanner lastSync={lastSync} />}
      
      <Calendar
        onDayPress={(d: any) => setSelectedDate(d.dateString)}
        markedDates={marked}
        theme={{
          backgroundColor: '#0c0e12', calendarBackground: '#0c0e12',
          todayTextColor: '#39FF14', todayBackgroundColor: '#39FF1433',
          dayTextColor: '#fff', textDisabledColor: '#3a3a3c',
          monthTextColor: '#fff', arrowColor: '#39FF14',
          selectedDayBackgroundColor: '#39FF14', selectedDayTextColor: '#000',
        }}
        style={{ borderRadius: 20, borderWidth: 1, borderColor: '#2c2c2e', margin: 16, overflow: 'hidden' }}
      />

      <Text style={styles.dateLabel}>{dateLabel}</Text>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#39FF14" /></View>
      ) : tasks.length === 0 ? (
        <View style={styles.center}><Text style={styles.empty}>Aucune tâche pour ce jour</Text></View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={t => t.id.toString()}
          style={{ flex: 1, marginHorizontal: 16, marginBottom: 8 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, item.completed ? styles.cardDone : null]}
              onPress={() => toggle(item)}
              onLongPress={() => remove(item)}
              activeOpacity={0.7}
            >
              <View style={[styles.circle, item.completed ? styles.circleDone : null]}>
                {item.completed ? <Text style={styles.check}>✓</Text> : null}
              </View>
              <Text style={[styles.title, item.completed ? styles.titleDone : null]}>{item.title}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Ajouter une tâche..."
          placeholderTextColor="#555"
          value={newTitle}
          onChangeText={setNewTitle}
          onSubmitEditing={addTask}
        />
        <TouchableOpacity style={styles.addBtn} onPress={addTask}>
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0c0e12' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  dateLabel: { color: '#8e8e93', fontSize: 14, textAlign: 'center', marginBottom: 8, textTransform: 'capitalize' },
  empty: { color: '#555', fontSize: 15 },
  card: {
    backgroundColor: '#1a1a1e', borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6,
  },
  cardDone: { opacity: 0.5 },
  circle: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#3a3a3c',
    alignItems: 'center', justifyContent: 'center',
  },
  circleDone: { backgroundColor: '#39FF14', borderColor: '#39FF14' },
  check: { color: '#000', fontSize: 11, fontWeight: '900' },
  title: { color: '#fff', fontSize: 15, flex: 1 },
  titleDone: { textDecorationLine: 'line-through', color: '#8e8e93' },
  inputRow: { flexDirection: 'row', gap: 8, padding: 16, paddingTop: 0 },
  input: {
    flex: 1, backgroundColor: '#1a1a1e', borderRadius: 12, padding: 14,
    color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#2c2c2e',
  },
  addBtn: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: '#39FF14',
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnText: { color: '#000', fontSize: 22, fontWeight: '800' },
});
