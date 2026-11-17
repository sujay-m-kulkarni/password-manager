/** Settings › Folders: add, rename, recolour and delete folders. */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/keyForms';
import { Banner, Button, Field } from '../../components/ui';
import {
  FOLDER_NAME_MAX,
  addFolder,
  deleteFolder,
  listFoldersWithCounts,
  updateFolder,
  type FolderWithCount,
} from '../../db/database';
import type { RootStackParamList } from '../../navigation/types';
import { useDb, useSession } from '../../store/session';
import { FOLDER_COLORS, colors, folderColor, fonts } from '../../theme';

type Editing = { id?: number; name: string; color: string };

export function FoldersScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Folders'>) {
  const db = useDb();
  const dataVersion = useSession(st => st.dataVersion);
  const touchData = useSession(st => st.touchData);
  const folders = useMemo(() => listFoldersWithCounts(db), [db, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = (f?: FolderWithCount) => {
    setError(null);
    setEditing(f ? { id: f.id, name: f.name, color: f.color } : { name: '', color: FOLDER_COLORS[folders.length % FOLDER_COLORS.length] });
  };

  const save = () => {
    if (!editing) {
      return;
    }
    try {
      if (editing.id != null) {
        updateFolder(db, editing.id, editing.name, editing.color);
      } else {
        addFolder(db, editing.name, editing.color);
      }
      touchData();
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the folder.');
    }
  };

  const remove = (f: FolderWithCount) => {
    const what =
      f.entries === 0
        ? 'It has no entries.'
        : `Its ${f.entries} ${f.entries === 1 ? 'entry stays' : 'entries stay'} in your vault, without a folder.`;
    Alert.alert(`Delete "${f.name}"?`, what, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete folder',
        style: 'destructive',
        onPress: () => {
          deleteFolder(db, f.id);
          touchData();
          setEditing(null);
        },
      },
    ]);
  };

  return (
    <Screen title="Folders" body="Group your entries. Each folder's colour shows on its entries and filter chip." onBack={() => navigation.goBack()}>
      <View style={st.list}>
        {folders.map(f => {
          const c = folderColor(f.color);
          const isOpen = editing?.id === f.id;
          return (
            <View key={f.id} style={st.item}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Edit folder ${f.name}`} onPress={() => (isOpen ? setEditing(null) : open(f))} style={st.row}>
                <View style={[st.swatch, { backgroundColor: c.solid }]} />
                <Text style={st.name}>{f.name}</Text>
                <Text style={st.count}>{f.entries}</Text>
              </Pressable>
              {isOpen && editing && (
                <Editor
                  editing={editing}
                  setEditing={setEditing}
                  error={error}
                  onSave={save}
                  onDelete={() => remove(f)}
                />
              )}
            </View>
          );
        })}
        {folders.length === 0 && <Text style={st.empty}>No folders yet.</Text>}
      </View>

      {editing && editing.id == null ? (
        <View style={st.newBox}>
          <Text style={st.newTitle}>New folder</Text>
          <Editor editing={editing} setEditing={setEditing} error={error} onSave={save} />
        </View>
      ) : (
        <Button title="+ New folder" onPress={() => open()} />
      )}
    </Screen>
  );
}

function Editor({
  editing,
  setEditing,
  error,
  onSave,
  onDelete,
}: {
  editing: Editing;
  setEditing: (e: Editing | null) => void;
  error: string | null;
  onSave: () => void;
  onDelete?: () => void;
}) {
  return (
    <View style={st.editor}>
      <Field
        label="Folder name"
        value={editing.name}
        onChangeText={t => setEditing({ ...editing, name: t })}
        maxLength={FOLDER_NAME_MAX}
        autoFocus={editing.id == null}
        onSubmitEditing={onSave}
      />
      <Text style={st.label}>Colour</Text>
      <View style={st.swatches} accessibilityRole="radiogroup">
        {FOLDER_COLORS.map(key => {
          const active = editing.color === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="radio"
              accessibilityLabel={key}
              accessibilityState={{ checked: active }}
              onPress={() => setEditing({ ...editing, color: key })}
              style={[st.pick, active && { borderColor: colors.ink }]}>
              <View style={[st.pickDot, { backgroundColor: folderColor(key).solid }]} />
            </Pressable>
          );
        })}
      </View>
      {error && <Banner text={error} />}
      <View style={st.actions}>
        <Button title="Save" small onPress={onSave} disabled={!editing.name.trim()} />
        <Button title="Cancel" small variant="ghost" onPress={() => setEditing(null)} />
        <View style={{ flex: 1 }} />
        {onDelete && <Button title="Delete" small variant="danger" onPress={onDelete} />}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  list: { backgroundColor: colors.surface, borderRadius: 18, overflow: 'hidden' },
  item: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16 },
  swatch: { width: 20, height: 20, borderRadius: 6 },
  name: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  count: { fontFamily: fonts.bold, fontSize: 14, color: colors.muted },
  empty: { padding: 16, fontFamily: fonts.regular, fontSize: 15, color: colors.muted },
  editor: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  newBox: { backgroundColor: colors.surface, borderRadius: 18, paddingTop: 16, gap: 4 },
  newTitle: { paddingHorizontal: 16, fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  label: { fontFamily: fonts.semibold, fontSize: 13, color: colors.inkSoft },
  swatches: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pick: { width: 44, height: 44, borderRadius: 14, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  pickDot: { width: 30, height: 30, borderRadius: 10 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
