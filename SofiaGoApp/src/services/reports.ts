import { supabase } from './supabase';

export type OccupancyLevel = 'empty' | 'normal' | 'full' | 'crowded';
export type SecurityIssue = 'inspector' | 'none';

export interface VehicleReport {
    id?: string;
    vehicleId: string;
    line: string;
    hasAC: boolean;
    occupancy: OccupancyLevel;
    security: SecurityIssue;
    createdAt: string; // ISO string
    userId?: string;
}

export const submitReport = async (report: Omit<VehicleReport, 'createdAt'>) => {
    const { data, error } = await supabase
        .from('reports')
        .insert([
            {
                vehicle_id: report.vehicleId,
                line: report.line,
                has_ac: report.hasAC,
                occupancy: report.occupancy,
                security: report.security,
                created_at: new Date().toISOString(),
                user_id: report.userId,
            },
        ]);

    if (error) {
        console.error('Error submitting report:', error);
        throw error;
    }
    return data;
};

export const fetchActiveReports = async (vehicleId: string): Promise<VehicleReport[]> => {
    // Query reports from the last 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .gt('created_at', fifteenMinutesAgo);

    if (error) {
        console.error('Error fetching reports:', error);
        return [];
    }

    return data.map((item: any) => ({
        id: item.id,
        vehicleId: item.vehicle_id,
        line: item.line,
        hasAC: item.has_ac,
        occupancy: item.occupancy,
        security: item.security,
        createdAt: item.created_at,
        userId: item.user_id,
    }));
};

export const subscribeToReports = (vehicleId: string, onNewReport: (report: VehicleReport) => void) => {
    return supabase
        .channel('custom-all-channel')
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'reports', filter: `vehicle_id=eq.${vehicleId}` },
            (payload) => {
                const item = payload.new;
                onNewReport({
                    id: item.id,
                    vehicleId: item.vehicle_id,
                    line: item.line,
                    hasAC: item.has_ac,
                    occupancy: item.occupancy,
                    security: item.security,
                    createdAt: item.created_at,
                    userId: item.user_id,
                });
            }
        )
        .subscribe();
};
