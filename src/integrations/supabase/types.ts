export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      agents: {
        Row: {
          activity: string
          archetype: string
          cash: number
          created_at: string
          equity: number
          id: string
          initial_capital: number
          last_cycle_at: string | null
          lineage_id: string
          name: string
          notes: string | null
          params: Json
          parent_id: string | null
          state: Json
          status: string
          symbols: string[]
          updated_at: string
          version: number
        }
        Insert: {
          activity?: string
          archetype: string
          cash: number
          created_at?: string
          equity: number
          id?: string
          initial_capital: number
          last_cycle_at?: string | null
          lineage_id: string
          name: string
          notes?: string | null
          params: Json
          parent_id?: string | null
          state?: Json
          status?: string
          symbols: string[]
          updated_at?: string
          version?: number
        }
        Update: {
          activity?: string
          archetype?: string
          cash?: number
          created_at?: string
          equity?: number
          id?: string
          initial_capital?: number
          last_cycle_at?: string | null
          lineage_id?: string
          name?: string
          notes?: string | null
          params?: Json
          parent_id?: string | null
          state?: Json
          status?: string
          symbols?: string[]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agents_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      cycle_runs: {
        Row: {
          details: Json
          finished_at: string | null
          id: string
          kind: string
          message: string | null
          started_at: string
          status: string
        }
        Insert: {
          details?: Json
          finished_at?: string | null
          id?: string
          kind: string
          message?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          details?: Json
          finished_at?: string | null
          id?: string
          kind?: string
          message?: string | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      equity_snapshots: {
        Row: {
          agent_id: string
          cash: number
          equity: number
          id: number
          positions_value: number
          taken_at: string
        }
        Insert: {
          agent_id: string
          cash: number
          equity: number
          id?: never
          positions_value: number
          taken_at: string
        }
        Update: {
          agent_id?: string
          cash?: number
          equity?: number
          id?: never
          positions_value?: number
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equity_snapshots_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ranking_snapshots: {
        Row: {
          agent_id: string
          days_running: number
          equity: number
          fees_paid: number
          id: string
          max_drawdown_pct: number
          position: number
          promotion: Json
          return_pct: number
          snapshot_date: string
          taken_at: string
          trades_count: number
          weekly_consistency_pct: number | null
        }
        Insert: {
          agent_id: string
          days_running: number
          equity: number
          fees_paid: number
          id?: string
          max_drawdown_pct: number
          position: number
          promotion?: Json
          return_pct: number
          snapshot_date: string
          taken_at?: string
          trades_count: number
          weekly_consistency_pct?: number | null
        }
        Update: {
          agent_id?: string
          days_running?: number
          equity?: number
          fees_paid?: number
          id?: string
          max_drawdown_pct?: number
          position?: number
          promotion?: Json
          return_pct?: number
          snapshot_date?: string
          taken_at?: string
          trades_count?: number
          weekly_consistency_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ranking_snapshots_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          agent_id: string
          candle_time: string
          created_at: string
          fee: number
          id: string
          indicators: Json
          notional: number
          price: number
          quantity: number
          realized_pnl: number | null
          reason: string
          reference_price: number
          side: string
          slippage_cost: number
          symbol: string
        }
        Insert: {
          agent_id: string
          candle_time: string
          created_at?: string
          fee: number
          id?: string
          indicators?: Json
          notional: number
          price: number
          quantity: number
          realized_pnl?: number | null
          reason: string
          reference_price: number
          side: string
          slippage_cost: number
          symbol: string
        }
        Update: {
          agent_id?: string
          candle_time?: string
          created_at?: string
          fee?: number
          id?: string
          indicators?: Json
          notional?: number
          price?: number
          quantity?: number
          realized_pnl?: number | null
          reason?: string
          reference_price?: number
          side?: string
          slippage_cost?: number
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
