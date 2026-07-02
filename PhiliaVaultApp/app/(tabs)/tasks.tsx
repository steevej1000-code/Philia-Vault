import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, ScrollView, Alert, Modal, FlatList
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import api from '../../services/api';
import { COLORS, RADIUS, SHADOW } from '../../constants/colors';
import { useUserPreferences } from '../../context/UserPreferencesContext';
import { OfflineBanner } from '../../components/OfflineBanner';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

// Localized months/days
LocaleConfig.locales['en'] = {
  monthNames: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  monthNamesShort: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  dayNames: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  dayNamesShort: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
  today: 'Today'
};
LocaleConfig.locales['fr'] = {
  monthNames: ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'],
  monthNamesShort: ['Janv.','Févr.','Mars','Avr.','Mai','Juin','Juil.','Août','Sept.','Oct.','Nov.','Déc.'],
  dayNames: ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'],
  dayNamesShort: ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'],
  today: "Aujourd'hui"
};

interface Category {
  id: number;
  name: string;
  color: string;
}

interface Task {
  id: number;
  category_id: number;
  title: string;
  task_date: string;
  completed: boolean;
}

type Screen = 'categories' | 'calendar' | 'tasks';

const PRESET_COLORS = ['#39FF14','#FF6B6B','#4FC3F7','#FFD93D','#A66CFF','#FF8A65','#81C784','#F06292','#4DD0E1','#FFF176'];

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useUserPreferences();
  const { isOnline } = useNetworkStatus();

  const [screen, setScreen] = useState<Screen>('categories');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [markedDates, setMarkedDates] = useState<Record<string, any>>({});
  const [selectedDate, setSelectedDate] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [modalAddCat, setModalAddCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0]);
  const [modalAddTask, setModalAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  useEffect(() => { LocaleConfig.defaultLocale = language || 'en'; }, [language]);

  // Load categories
  const loadCategories = useCallback(async () => {
    try {
      const res = await api.getTaskCategories();
      setCategories(res.data.categories || []);
    } catch (e) { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { loadCategories(); }, [loadCategories]));

  // Load calendar marks for a category
  const loadCalendarMarks = async (catId: number) => {
    try {
      const res = await api.getTasks(catId);
      const tasksData: Task[] = res.data.tasks || [];
      const marks: Record<string, any> = {};
      const today = new Date().toISOString().split('T')[0];
      tasksData.forEach(t => {
        const dateStr = t.task_date;
        if (!marks[dateStr]) marks[dateStr] = { marked: true, dots: [] };
        marks[dateStr].dots.push({ key: t.id.toString(), color: t.completed ? '#39FF14' : '#FF6B6B' });
      });
      // Mark today
      if (!marks[today]) marks[today] = { marked: false };
      marks[today].selected = true;
      marks[today].selectedColor = '#39FF1433';
      setMarkedDates(marks);
      setSelectedCategory(categories.find(c => c.id === catId) || null);
      setScreen('calendar');
    } catch (e) { Alert.alert('Error', 'Failed to load tasks'); }
  };

  // Load tasks for a date
  const loadTasksForDate = async (catId: number, date: string) => {
    try {
      const res = await api.getTasks(catId, date);
      setTasks(res.data.tasks || []);
      setSelectedDate(date);
      setScreen('tasks');
    } catch (e) { Alert.alert('Error', 'Failed to load tasks'); }
  };

  // Create category
  const createCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      await api.createTaskCategory(newCatName.trim(), newCatColor);
      setModalAddCat(false); setNewCatName('');
      loadCategories();
    } catch (e: any) { Alert.alert('Error', e.response?.data?.error || 'Failed'); }
  };

  // Delete category
  const deleteCategory = (cat: Category) => {
    Alert.alert('Supprimer', `Supprimer "${cat.name}" et toutes ses tâches ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try {
          await api.deleteTaskCategory(cat.id);
          loadCategories();
        } catch (e) { Alert.alert('Error', 'Failed to delete'); }
      }}
    ]);
  };

  // Create task
  const createTask = async () => {
    if (!newTaskTitle.trim() || !selectedCategory) return;
    try {
      await api.createTask(selectedCategory.id, newTaskTitle.trim(), selectedDate);
      setModalAddTask(false); setNewTaskTitle('');
      loadTasksForDate(selectedCategory.id, selectedDate);
    } catch (e: any) { Alert.alert('Error', e.response?.data?.error || 'Failed'); }
  };

  // Toggle task completion
  const toggleTask = async (task: Task) => {
    try {
      await api.updateTask(task.id, { completed: !task.completed });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t));
    } catch (e) { /* ignore */ }
  };

  // Delete task
  const deleteTask = (task: Task) => {
    Alert.alert('Supprimer', `Supprimer "${task.title}" ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => {
        try {
          await api.deleteTask(task.id);
          setTasks(prev => prev.filter(t => t.id !== task.id));
        } catch (e) { /* ignore */ }
      }}
    ]);
  };

  // Render: Categories list
  if (screen === 'categories') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <OfflineBanner />
        <View style={styles.header}>
          <Text style={styles.headerTitle}>📋 Catégories</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => setModalAddCat(true)}>
            <Text style={styles.addBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator color="#39FF14" size="large" /></View>
        ) : categories.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>Aucune catégorie</Text>
            <Text style={styles.mutedText}>Crée ta première catégorie de tâches</Text>
          </View>
        ) : (
          <FlatList
            data={categories}
            keyExtractor={c => c.id.toString()}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.catCard, { borderLeftColor: item.color || '#39FF14' }]}
                onPress={() => loadCalendarMarks(item.id)}
                onLongPress={() => deleteCategory(item)}
              >
                <View style={styles.catRow}>
                  <View style={[styles.catDot, { backgroundColor: item.color || '#39FF14' }]} />
                  <Text style={styles.catName}>{item.name}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            )}
          />
        )}

        {/* Modal: Add category */}
        <Modal visible={modalAddCat} transparent animationType="slide" onRequestClose={() => setModalAddCat(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>Nouvelle catégorie</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Nom de la catégorie"
                placeholderTextColor="#8e8e93"
                value={newCatName}
                onChangeText={setNewCatName}
              />
              <View style={styles.colorRow}>
                {PRESET_COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.colorSwatch, { backgroundColor: c }, newCatColor === c && styles.colorSelected]}
                    onPress={() => setNewCatColor(c)}
                  />
                ))}
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity onPress={() => setModalAddCat(false)} style={styles.modalCancelBtn}>
                  <Text style={styles.modalCancelText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={createCategory} style={styles.modalConfirmBtn}>
                  <Text style={styles.modalConfirmText}>Créer</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // Render: Calendar
  if (screen === 'calendar') {
    const today = new Date().toISOString().split('T')[0];
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <OfflineBanner />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { setScreen('categories'); setSelectedCategory(null); }}>
            <Text style={styles.backBtn}>‹ Retour</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{selectedCategory?.name || 'Calendrier'}</Text>
          <View style={{ width: 70 }} />
        </View>

        <Calendar
          onDayPress={(day: any) => loadTasksForDate(selectedCategory!.id, day.dateString)}
          markedDates={markedDates}
          markingType="multi-dot"
          theme={{
            backgroundColor: '#0c0e12',
            calendarBackground: '#0c0e12',
            todayBackgroundColor: '#39FF1433',
            todayTextColor: '#39FF14',
            dayTextColor: '#ffffff',
            textDisabledColor: '#3a3a3c',
            monthTextColor: '#ffffff',
            arrowColor: '#39FF14',
            selectedDayBackgroundColor: '#39FF14',
            selectedDayTextColor: '#000000',
          }}
          style={{ borderRadius: 20, borderWidth: 1, borderColor: '#2c2c2e', margin: 16, overflow: 'hidden' }}
        />
      </View>
    );
  }

  // Render: Tasks for a date
  const dateFormatted = selectedDate
    ? new Date(selectedDate + 'T12:00:00').toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      })
    : '';
  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <OfflineBanner />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { setScreen('calendar'); setTasks([]); }}>
          <Text style={styles.backBtn}>‹ Calendrier</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{selectedCategory?.name}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalAddTask(true)}>
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.dateHeader}>{dateFormatted}</Text>

      {tasks.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Aucune tâche</Text>
          <TouchableOpacity style={styles.emptyAddBtn} onPress={() => setModalAddTask(true)}>
            <Text style={styles.emptyAddText}>+ Ajouter une tâche</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={t => t.id.toString()}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.taskCard, item.completed && styles.taskDone]}
              onPress={() => toggleTask(item)}
              onLongPress={() => deleteTask(item)}
            >
              <View style={[styles.checkCircle, item.completed && styles.checkDone]}>
                {item.completed && <Text style={styles.checkMark}>✓</Text>}
              </View>
              <Text style={[styles.taskTitle, item.completed && styles.taskTitleDone]}>{item.title}</Text>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Modal: Add task */}
      <Modal visible={modalAddTask} transparent animationType="slide" onRequestClose={() => setModalAddTask(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Nouvelle tâche</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Description de la tâche"
              placeholderTextColor="#8e8e93"
              value={newTaskTitle}
              onChangeText={setNewTaskTitle}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setModalAddTask(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={createTask} style={styles.modalConfirmBtn}>
                <Text style={styles.modalConfirmText}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0c0e12' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 8 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#ffffff' },
  backBtn: { color: '#39FF14', fontSize: 16, fontWeight: '700' },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#39FF14', alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#000', fontSize: 20, fontWeight: '800' },

  // Categories
  catCard: {
    backgroundColor: '#1a1a1e', borderRadius: 16, borderLeftWidth: 4, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'
  },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  catDot: { width: 12, height: 12, borderRadius: 6 },
  catName: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  chevron: { color: '#8e8e93', fontSize: 22 },

  // Tasks
  dateHeader: { color: '#8e8e93', fontSize: 14, textAlign: 'center', marginBottom: 8, textTransform: 'capitalize' },
  taskCard: {
    backgroundColor: '#1a1a1e', borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  taskDone: { opacity: 0.5 },
  checkCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#3a3a3c', alignItems: 'center', justifyContent: 'center' },
  checkDone: { backgroundColor: '#39FF14', borderColor: '#39FF14' },
  checkMark: { color: '#000', fontSize: 12, fontWeight: '900' },
  taskTitle: { color: '#ffffff', fontSize: 15, flex: 1 },
  taskTitleDone: { textDecorationLine: 'line-through', color: '#8e8e93' },

  // Empty
  emptyText: { color: '#8e8e93', fontSize: 16, fontWeight: '600' },
  mutedText: { color: '#555', fontSize: 13, marginTop: 6 },
  emptyAddBtn: { marginTop: 16, backgroundColor: '#1a1a1e', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  emptyAddText: { color: '#39FF14', fontSize: 14, fontWeight: '600' },

  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 32 },
  modal: { backgroundColor: '#1c1c1e', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#2c2c2e' },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 16 },
  modalInput: {
    backgroundColor: '#0c0e12', borderWidth: 1, borderColor: '#2c2c2e', borderRadius: 12,
    padding: 14, color: '#fff', fontSize: 15, marginBottom: 16,
  },
  colorRow: { flexDirection: 'row', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  colorSelected: { borderWidth: 2, borderColor: '#fff' },
  modalActions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  modalCancelBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  modalCancelText: { color: '#8e8e93', fontSize: 15, fontWeight: '600' },
  modalConfirmBtn: { backgroundColor: '#39FF14', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  modalConfirmText: { color: '#000', fontSize: 15, fontWeight: '800' },
});
