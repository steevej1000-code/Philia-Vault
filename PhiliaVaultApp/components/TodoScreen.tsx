import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Alert, ActivityIndicator } from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import api from '../services/api';
import { COLORS, RADIUS } from '../constants/colors';
import { useUserPreferences } from '../context/UserPreferencesContext';

LocaleConfig.locales['fr'] = {
  monthNames: ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'],
  monthNamesShort: ['Janv.','Févr.','Mars','Avr.','Mai','Juin','Juil.','Août','Sept.','Oct.','Nov.','Déc.'],
  dayNames: ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'],
  dayNamesShort: ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'],
  today: "Aujourd'hui"
};

interface TodoTask {
  id: number;
  title: string;
  task_date: string;
  completed: boolean;
}

export function TodoScreen() {
  const { language } = useUserPreferences();
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [tasks, setTasks] = useState<TodoTask[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [markedDates, setMarkedDates] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    LocaleConfig.defaultLocale = language || 'en';
  }, [language]);

  // Load tasks for selected date and month counts
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [monthStr] = selectedDate.split('-').slice(0, 2);
      const month = selectedDate.substring(0, 7); // YYYY-MM
      const [tasksRes, countsRes] = await Promise.all([
        api.getTodoTasks(selectedDate),
        api.getTodoTaskCounts(month),
      ]);
      setTasks(tasksRes.tasks || []);
      const marks: Record<string, any> = {};
      const counts = countsRes.counts || [];
      counts.forEach((c: any) => {
        marks[c.task_date] = {
          marked: true,
          dotColor: c.done > 0 && c.done >= c.total ? '#39FF14' : '#39FF1466',
        };
      });
      marks[selectedDate] = { ...(marks[selectedDate] || {}), selected: true, selectedColor: '#39FF14' };
      setMarkedDates(marks);
    } catch (e) {
      console.error('Todo load error:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => { loadData(); }, [loadData]);

  const addTask = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    try {
      await api.createTodoTask(title, selectedDate);
      setNewTitle('');
      await loadData();
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Impossible de créer la tâche');
    } finally {
      setAdding(false);
    }
  };

  const toggleTask = async (task: TodoTask) => {
    try {
      await api.toggleTodoTask(task.id, !task.completed);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t));
    } catch (e: any) {
      Alert.alert('Erreur', e.message || 'Impossible de mettre à jour');
    }
  };

  const deleteTask = (task: TodoTask) => {
    Alert.alert('Supprimer', `Supprimer "${task.title}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try {
          await api.deleteTodoTask(task.id);
          await loadData();
        } catch (e) { /* ignore */ }
      }},
    ]);
  };

  const dateLabel = selectedDate
    ? new Date(selectedDate + 'T12:00:00').toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
        weekday: 'long', day: 'numeric', month: 'long'
      })
    : '';

  return (
    <View style={styles.container}>
      <Calendar
        onDayPress={(day: any) => setSelectedDate(day.dateString)}
        markedDates={markedDates}
        markingType="dot"
        theme={{
          backgroundColor: '#000000',
          calendarBackground: '#000000',
          todayTextColor: '#39FF14',
          todayBackgroundColor: '#39FF1433',
          dayTextColor: '#ffffff',
          textDisabledColor: '#3a3a3c',
          monthTextColor: '#ffffff',
          arrowColor: '#39FF14',
          selectedDayBackgroundColor: '#39FF14',
          selectedDayTextColor: '#000',
        }}
        style={{ borderRadius: 16, borderWidth: 1, borderColor: '#2c2c2e', marginBottom: 12, overflow: 'hidden' }}
      />

      <Text style={styles.dateLabel}>{dateLabel}</Text>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#39FF14" /></View>
      ) : tasks.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Aucune tâche pour ce jour</Text>
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={t => t.id.toString()}
          style={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.taskCard, item.completed && styles.taskDone]}
              onPress={() => toggleTask(item)}
              onLongPress={() => deleteTask(item)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkCircle, item.completed && styles.checkDone]}>
                {item.completed && <Text style={styles.checkMark}>✓</Text>}
              </View>
              <Text style={[styles.taskTitle, item.completed && styles.taskTitleDone]}>{item.title}</Text>
              <Text style={styles.deleteHint}>✕</Text>
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
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.addBtn} onPress={addTask} disabled={adding || !newTitle.trim()}>
          <Text style={styles.addBtnText}>{adding ? '...' : '+'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  dateLabel: { color: '#8e8e93', fontSize: 15, textAlign: 'center', marginBottom: 12, textTransform: 'capitalize' },
  emptyText: { color: '#555', fontSize: 14 },
  list: { flex: 1, marginBottom: 12 },
  taskCard: {
    backgroundColor: '#1a1a1a', borderRadius: 12, padding: 14, marginBottom: 6,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  taskDone: { opacity: 0.5 },
  checkCircle: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#3a3a3c',
    alignItems: 'center', justifyContent: 'center',
  },
  checkDone: { backgroundColor: '#39FF14', borderColor: '#39FF14' },
  checkMark: { color: '#000', fontSize: 12, fontWeight: '900' },
  taskTitle: { color: '#fff', fontSize: 15, flex: 1 },
  taskTitleDone: { textDecorationLine: 'line-through', color: '#8e8e93' },
  deleteHint: { color: '#555', fontSize: 16 },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12, paddingHorizontal: 16,
    paddingVertical: 12, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#2c2c2e',
  },
  addBtn: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: '#39FF14',
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnText: { color: '#000', fontSize: 22, fontWeight: '800' },
});
