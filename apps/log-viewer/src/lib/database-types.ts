/**
 * @file database-types.ts
 * @description Type definitions for Supabase tables used by the log viewer.
 * @role Shared type layer for the log viewer client.
 *
 * @pseudocode
 *  1. Define the JSON scalar type used by Supabase.
 *  2. Model the script_logs table row shape.
 *  3. Model the worker_status table row shape.
 *  4. Model insert and update payloads.
 *  5. Export the Database mapping.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      script_logs: {
        Row: {
          id: string;
          script_name: string;
          level: string;
          message: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          script_name: string;
          level: string;
          message: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          script_name?: string;
          level?: string;
          message?: string;
          metadata?: Json;
          created_at?: string;
        };
      };
      worker_status: {
        Row: {
          name: string;
          status: string;
          message: string | null;
          last_heartbeat: string | null;
          last_started_at: string | null;
          last_stopped_at: string | null;
          updated_at: string;
        };
        Insert: {
          name: string;
          status: string;
          message?: string | null;
          last_heartbeat?: string | null;
          last_started_at?: string | null;
          last_stopped_at?: string | null;
          updated_at?: string;
        };
        Update: {
          name?: string;
          status?: string;
          message?: string | null;
          last_heartbeat?: string | null;
          last_started_at?: string | null;
          last_stopped_at?: string | null;
          updated_at?: string;
        };
      };
    };
  };
};

export type ScriptLog = Database['public']['Tables']['script_logs']['Row'];
export type WorkerStatus = Database['public']['Tables']['worker_status']['Row'];
