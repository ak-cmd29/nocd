import type { AttemptStatus, EvaluationResult, Question, UserRole } from "./index";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          role: UserRole;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: UserRole;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role?: UserRole;
          created_at?: string;
        };
        Relationships: [];
      };
      knowledge_checks: {
        Row: {
          id: string;
          manager_id: string;
          topic: string;
          reference_material: string;
          questions: Question[];
          created_at: string;
        };
        Insert: {
          id?: string;
          manager_id?: string;
          topic: string;
          reference_material: string;
          questions: Question[];
          created_at?: string;
        };
        Update: {
          id?: string;
          manager_id?: string;
          topic?: string;
          reference_material?: string;
          questions?: Question[];
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "knowledge_checks_manager_id_fkey";
            columns: ["manager_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      attempts: {
        Row: {
          id: string;
          check_id: string;
          agent_id: string;
          audio_urls: string[];
          transcripts: string[];
          evaluation: EvaluationResult[];
          status: AttemptStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          check_id: string;
          agent_id?: string;
          audio_urls?: string[];
          transcripts?: string[];
          evaluation?: EvaluationResult[];
          status?: AttemptStatus;
          created_at?: string;
        };
        Update: {
          id?: string;
          check_id?: string;
          agent_id?: string;
          audio_urls?: string[];
          transcripts?: string[];
          evaluation?: EvaluationResult[];
          status?: AttemptStatus;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attempts_check_id_fkey";
            columns: ["check_id"];
            isOneToOne: false;
            referencedRelation: "knowledge_checks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attempts_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      current_user_role: { Args: Record<string, never>; Returns: string };
      is_manager: { Args: Record<string, never>; Returns: boolean };
      is_agent: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
