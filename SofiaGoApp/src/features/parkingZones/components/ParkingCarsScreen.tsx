import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
    MAX_PARKING_CAR_NAME_LENGTH,
    type ParkingCar,
    validateParkingCarPlate,
} from '../../../services/parkingCars';

interface Props {
    cars: ParkingCar[];
    loading?: boolean;
    onAddCar: (plate: string, name?: string) => Promise<unknown> | unknown;
    onRemoveCar: (id: string) => Promise<unknown> | unknown;
    onUpdateCar: (id: string, plate: string, name?: string) => Promise<unknown> | unknown;
    onSetDefaultCar: (id: string) => Promise<unknown> | unknown;
    onClose: () => void;
}

export const ParkingCarsScreen: React.FC<Props> = ({
    cars,
    loading = false,
    onAddCar,
    onRemoveCar,
    onUpdateCar,
    onSetDefaultCar,
    onClose,
}) => {
    const [nameInput, setNameInput] = useState('');
    const [plateInput, setPlateInput] = useState('');
    const [addCarVisible, setAddCarVisible] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [editingCarId, setEditingCarId] = useState<string | null>(null);
    const [editingPlateInput, setEditingPlateInput] = useState('');
    const [editingNameInput, setEditingNameInput] = useState('');
    const [editingSubmitting, setEditingSubmitting] = useState(false);
    const [editingErrorMessage, setEditingErrorMessage] = useState<string | null>(null);

    const validation = useMemo(() => validateParkingCarPlate(plateInput), [plateInput]);
    const liveValidationError = plateInput.trim().length > 0 && !validation.isValid ? validation.error : null;
    const helperMessage = errorMessage
        || liveValidationError
        || (plateInput.trim().length > 0
            ? 'Номерът е валиден.'
            : 'Въведи номера така, както ще се прати по SMS: на латиница, без интервали и тирета.');
    const editingValidation = useMemo(() => validateParkingCarPlate(editingPlateInput), [editingPlateInput]);
    const liveEditingValidationError = editingPlateInput.trim().length > 0 && !editingValidation.isValid ? editingValidation.error : null;

    const closeAddCarEditor = () => {
        if (submitting) {
            return;
        }

        setAddCarVisible(false);
        setNameInput('');
        setPlateInput('');
        setErrorMessage(null);
    };

    const handleAddCar = async () => {
        const nextValidation = validateParkingCarPlate(plateInput);
        if (!nextValidation.isValid) {
            setErrorMessage(nextValidation.error);
            return;
        }

        setSubmitting(true);
        setErrorMessage(null);
        try {
            await onAddCar(nextValidation.normalizedPlate, nameInput);
            closeAddCarEditor();
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Не успяхме да запазим колата.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleStartNameEdit = (car: ParkingCar) => {
        setEditingCarId(car.id);
        setEditingPlateInput(car.plate);
        setEditingNameInput(car.name || '');
        setEditingErrorMessage(null);
    };

    const handleSaveCar = async () => {
        if (!editingCarId) {
            return;
        }

        const nextValidation = validateParkingCarPlate(editingPlateInput);
        if (!nextValidation.isValid) {
            setEditingErrorMessage(nextValidation.error);
            return;
        }

        setEditingSubmitting(true);
        setEditingErrorMessage(null);
        try {
            await onUpdateCar(editingCarId, nextValidation.normalizedPlate, editingNameInput);
            setEditingCarId(null);
            setEditingPlateInput('');
            setEditingNameInput('');
        } catch (error) {
            setEditingErrorMessage(error instanceof Error ? error.message : 'Не успяхме да запазим колата.');
        } finally {
            setEditingSubmitting(false);
        }
    };

    const handleDeleteCar = (car: ParkingCar) => {
        const carLabel = car.name ? `${car.name} (${car.displayPlate})` : car.displayPlate;
        Alert.alert(
            'Премахни колата',
            `Сигурен ли си, че искаш да премахнеш ${carLabel}?`,
            [
                { text: 'Отказ', style: 'cancel' },
                {
                    text: 'Премахни',
                    style: 'destructive',
                    onPress: () => {
                        void onRemoveCar(car.id);
                    },
                },
            ],
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerTopRow}>
                    <View style={styles.headerTextWrap}>
                        <Text style={styles.title}>Моите коли</Text>
                    </View>
                    <View style={styles.headerActions}>
                        <TouchableOpacity
                            style={styles.addButton}
                            onPress={() => {
                                setEditingCarId(null);
                                setEditingPlateInput('');
                                setEditingNameInput('');
                                setEditingErrorMessage(null);
                                setAddCarVisible(true);
                            }}
                        >
                            <Ionicons name="add" size={16} color="#FFFFFF" />
                            <Text style={styles.addButtonText}>Добави кола</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={18} color="#64748B" />
                        </TouchableOpacity>
                    </View>
                </View>

            </View>

            <FlatList
                data={cars}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={loading ? (
                    <View style={styles.emptyWrap}>
                        <ActivityIndicator size="small" color="#1D4ED8" />
                        <Text style={styles.emptyText}>Зареждаме колите...</Text>
                    </View>
                ) : (
                    <View style={styles.emptyWrap}>
                        <Text style={styles.emptyText}>Още нямаш добавени коли.</Text>
                    
                    </View>
                )}
                renderItem={({ item }) => {
                    const isEditingCar = editingCarId === item.id;

                    return (
                        <View style={styles.card}>
                            <View style={styles.cardHeader}>
                                <View style={styles.cardInfo}>
                                    <Text style={item.name ? styles.cardNameTitle : styles.cardTitle}>{item.name || item.displayPlate}</Text>
                                    <Text style={styles.cardSubtitle}>{item.name ? item.displayPlate : 'Запазен номер за паркиране'}</Text>
                                    <TouchableOpacity style={styles.nameLink} onPress={() => handleStartNameEdit(item)}>
                                        <Ionicons name="pencil-outline" size={13} color="#1D4ED8" />
                                        <Text style={styles.nameLinkText}>Редактирай</Text>
                                    </TouchableOpacity>
                                </View>
                                {item.isDefault ? (
                                    <View style={styles.defaultBadge}>
                                        <Ionicons name="checkmark-circle" size={14} color="#0F766E" />
                                        <Text style={styles.defaultBadgeText}>Основна</Text>
                                    </View>
                                ) : null}
                            </View>

                            {isEditingCar ? (
                                <View style={styles.nameEditorWrap}>
                                    <TextInput
                                        style={[styles.input, (editingErrorMessage || liveEditingValidationError) ? styles.inputError : null]}
                                        value={editingPlateInput}
                                        onChangeText={(value) => {
                                            setEditingPlateInput(value);
                                            if (editingErrorMessage) {
                                                setEditingErrorMessage(null);
                                            }
                                        }}
                                        placeholder="CA1234AB"
                                        placeholderTextColor="#94A3B8"
                                        autoCapitalize="characters"
                                        autoCorrect={false}
                                        spellCheck={false}
                                        maxLength={12}
                                    />
                                    <TextInput
                                        style={styles.nameInput}
                                        value={editingNameInput}
                                        onChangeText={setEditingNameInput}
                                        placeholder="Име на колата"
                                        placeholderTextColor="#94A3B8"
                                        autoCapitalize="sentences"
                                        autoCorrect={false}
                                        spellCheck={false}
                                        maxLength={MAX_PARKING_CAR_NAME_LENGTH}
                                    />
                                    {(editingErrorMessage || liveEditingValidationError) ? <Text style={styles.helperTextError}>{editingErrorMessage || liveEditingValidationError}</Text> : null}
                                    <View style={styles.nameEditorActions}>
                                        <TouchableOpacity
                                            style={[styles.secondaryButton, editingSubmitting && styles.secondaryButtonDisabled]}
                                            disabled={editingSubmitting}
                                            onPress={() => void handleSaveCar()}
                                        >
                                            <Ionicons name="checkmark-outline" size={14} color="#1D4ED8" />
                                            <Text style={styles.secondaryButtonText}>{editingSubmitting ? 'Запазва...' : 'Запази'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.cancelButton}
                                            onPress={() => {
                                                setEditingCarId(null);
                                                setEditingPlateInput('');
                                                setEditingNameInput('');
                                                setEditingErrorMessage(null);
                                            }}
                                        >
                                            <Ionicons name="close-outline" size={14} color="#475569" />
                                            <Text style={styles.cancelButtonText}>Отказ</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ) : null}

                            <View style={styles.cardActions}>
                                {!item.isDefault ? (
                                    <TouchableOpacity style={styles.secondaryButton} onPress={() => void onSetDefaultCar(item.id)}>
                                        <Ionicons name="star-outline" size={14} color="#1D4ED8" />
                                        <Text style={styles.secondaryButtonText}>Направи основна</Text>
                                    </TouchableOpacity>
                                ) : (
                                    <View style={styles.secondaryButtonMuted}>
                                        <Ionicons name="star" size={14} color="#0F766E" />
                                        <Text style={styles.secondaryButtonMutedText}>Ще се ползва за SMS</Text>
                                    </View>
                                )}
                                <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteCar(item)}>
                                    <Ionicons name="trash-outline" size={14} color="#DC2626" />
                                    <Text style={styles.deleteButtonText}>Изтрий</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    );
                }}
            />

            <Modal animationType="fade" transparent visible={addCarVisible} onRequestClose={closeAddCarEditor} statusBarTranslucent>
                <View style={styles.editorOverlay}>
                    <Pressable style={styles.editorBackdrop} onPress={closeAddCarEditor} />
                    <View style={styles.editorModalCard}>
                        <Pressable onPress={closeAddCarEditor} style={styles.editorCloseButton}>
                            <Ionicons name="close" size={16} color="#334155" />
                        </Pressable>
                        <Text style={styles.editorTitle}>Добави кола</Text>
                        <TextInput
                            style={styles.nameInput}
                            value={nameInput}
                            onChangeText={setNameInput}
                            placeholder="Име на колата"
                            placeholderTextColor="#94A3B8"
                            autoCapitalize="sentences"
                            autoCorrect={false}
                            spellCheck={false}
                            maxLength={MAX_PARKING_CAR_NAME_LENGTH}
                        />
                        <TextInput
                            style={[styles.input, (errorMessage || liveValidationError) ? styles.inputError : null]}
                            value={plateInput}
                            onChangeText={(value) => {
                                setPlateInput(value);
                                if (errorMessage) {
                                    setErrorMessage(null);
                                }
                            }}
                            placeholder="CA1234AB"
                            placeholderTextColor="#94A3B8"
                            autoCapitalize="characters"
                            autoCorrect={false}
                            spellCheck={false}
                            maxLength={12}
                        />
                        <Text style={[styles.helperText, (errorMessage || liveValidationError) ? styles.helperTextError : null, !errorMessage && !liveValidationError && plateInput.trim().length > 0 ? styles.helperTextValid : null]}>
                            {helperMessage}
                        </Text>
                        <TouchableOpacity
                            style={[styles.saveButton, (!validation.isValid || submitting) && styles.saveButtonDisabled]}
                            disabled={!validation.isValid || submitting}
                            onPress={() => void handleAddCar()}
                        >
                            <Text style={styles.saveButtonText}>{submitting ? 'Запазва...' : 'Добави колата'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.editorCancelRow} disabled={submitting} onPress={closeAddCarEditor}>
                            <Ionicons name="close-outline" size={14} color="#94A3B8" />
                            <Text style={styles.editorCancelRowText}>Откажи</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 18,
    },
    header: {
        paddingHorizontal: 18,
        marginBottom: 10,
    },
    headerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerTextWrap: {
        flex: 1,
        paddingRight: 12,
    },
    headerSubtitleWrap: {
        marginTop: 4,
    },
    title: {
        fontSize: 17,
        fontWeight: '800',
        color: '#0F172A',
    },
    subtitle: {
        marginTop: 4,
        fontSize: 12,
        lineHeight: 18,
        color: '#64748B',
        fontWeight: '600',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    closeButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(248,250,252,0.72)',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: '#0F766E',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 7,
    },
    addButtonText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },
    listContent: {
        paddingHorizontal: 18,
        paddingBottom: 12,
        gap: 10,
    },
    editorOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15,23,42,0.18)',
        justifyContent: 'center',
        paddingHorizontal: 18,
    },
    editorBackdrop: {
        ...StyleSheet.absoluteFillObject,
    },
    editorModalCard: {
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        padding: 16,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 28,
        elevation: 10,
    },
    editorCloseButton: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(248,250,252,0.72)',
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.72)',
        zIndex: 1,
    },
    editorTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 10,
        paddingRight: 44,
    },
    nameInput: {
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#CBD5E1',
        backgroundColor: '#F8FAFC',
        paddingHorizontal: 14,
        fontSize: 14,
        fontWeight: '600',
        color: '#0F172A',
        marginBottom: 10,
    },
    input: {
        height: 46,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#CBD5E1',
        backgroundColor: '#F8FAFC',
        paddingHorizontal: 14,
        fontSize: 16,
        fontWeight: '700',
        color: '#0F172A',
        letterSpacing: 0.8,
    },
    inputError: {
        borderColor: '#FCA5A5',
        backgroundColor: '#FEF2F2',
    },
    helperText: {
        marginTop: 8,
        fontSize: 11,
        lineHeight: 16,
        color: '#64748B',
        fontWeight: '600',
    },
    helperTextError: {
        color: '#DC2626',
    },
    helperTextValid: {
        color: '#0F766E',
    },
    saveButton: {
        marginTop: 12,
        backgroundColor: '#1D4ED8',
        borderRadius: 10,
        paddingVertical: 11,
        alignItems: 'center',
    },
    saveButtonDisabled: {
        backgroundColor: '#93C5FD',
    },
    saveButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },
    editorCancelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        paddingVertical: 10,
        marginTop: 4,
    },
    editorCancelRowText: {
        color: '#94A3B8',
        fontSize: 11,
        fontWeight: '600',
    },
    emptyWrap: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 28,
    },
    emptyText: {
        marginTop: 10,
        textAlign: 'center',
        color: '#475569',
        fontSize: 13,
        fontWeight: '700',
    },
    emptyHint: {
        marginTop: 6,
        textAlign: 'center',
        color: '#94A3B8',
        fontSize: 12,
        lineHeight: 18,
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.82)',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 1,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 10,
    },
    cardInfo: {
        flex: 1,
    },
    cardNameTitle: {
        fontSize: 17,
        fontWeight: '900',
        color: '#0F172A',
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: '900',
        color: '#0F172A',
        letterSpacing: 1,
    },
    cardSubtitle: {
        marginTop: 4,
        fontSize: 11,
        color: '#64748B',
        fontWeight: '600',
    },
    nameLink: {
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
    },
    nameLinkText: {
        color: '#1D4ED8',
        fontSize: 12,
        fontWeight: '700',
    },
    nameEditorWrap: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(226,232,240,0.82)',
    },
    nameEditorActions: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 10,
    },
    defaultBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: 'rgba(13,148,136,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(13,148,136,0.18)',
    },
    defaultBadgeText: {
        fontSize: 11,
        color: '#0F766E',
        fontWeight: '800',
    },
    cardActions: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
    },
    secondaryButton: {
        flex: 1,
        height: 38,
        borderRadius: 10,
        backgroundColor: 'rgba(239,246,255,0.82)',
        borderWidth: 1,
        borderColor: 'rgba(191,219,254,0.72)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
    },
    secondaryButtonDisabled: {
        opacity: 0.7,
    },
    secondaryButtonText: {
        color: '#1D4ED8',
        fontSize: 12,
        fontWeight: '700',
    },
    secondaryButtonMuted: {
        flex: 1,
        height: 38,
        borderRadius: 10,
        backgroundColor: 'rgba(13,148,136,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(13,148,136,0.18)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
    },
    secondaryButtonMutedText: {
        color: '#0F766E',
        fontSize: 12,
        fontWeight: '700',
    },
    cancelButton: {
        height: 38,
        borderRadius: 10,
        paddingHorizontal: 12,
        backgroundColor: '#F1F5F9',
        borderWidth: 1,
        borderColor: '#CBD5E1',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
    },
    cancelButtonText: {
        color: '#475569',
        fontSize: 12,
        fontWeight: '700',
    },
    deleteButton: {
        height: 38,
        borderRadius: 10,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(254,242,242,0.92)',
        borderWidth: 1,
        borderColor: 'rgba(252,165,165,0.82)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
    },
    deleteButtonText: {
        color: '#DC2626',
        fontSize: 12,
        fontWeight: '700',
    },
});