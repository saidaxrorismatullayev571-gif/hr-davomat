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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      amocrm_calls: {
        Row: {
          amocrm_user: number
          created_at: string
          davomiylik: number
          id: number
          vaqt: string
          yonalish: string | null
        }
        Insert: {
          amocrm_user: number
          created_at?: string
          davomiylik?: number
          id: number
          vaqt: string
          yonalish?: string | null
        }
        Update: {
          amocrm_user?: number
          created_at?: string
          davomiylik?: number
          id?: number
          vaqt?: string
          yonalish?: string | null
        }
        Relationships: []
      }
      amocrm_tasks: {
        Row: {
          amocrm_user: number
          bajarildi: boolean
          created_at: string
          id: number
          oz_vaqtida: boolean
          vaqt: string
        }
        Insert: {
          amocrm_user: number
          bajarildi?: boolean
          created_at?: string
          id: number
          oz_vaqtida?: boolean
          vaqt: string
        }
        Update: {
          amocrm_user?: number
          bajarildi?: boolean
          created_at?: string
          id?: number
          oz_vaqtida?: boolean
          vaqt?: string
        }
        Relationships: []
      }
      bonus: {
        Row: {
          created_at: string
          id: number
          oy: string
          sabab: string | null
          sana: string
          summa: number
          telegram_id: number
        }
        Insert: {
          created_at?: string
          id?: never
          oy: string
          sabab?: string | null
          sana?: string
          summa: number
          telegram_id: number
        }
        Update: {
          created_at?: string
          id?: never
          oy?: string
          sabab?: string | null
          sana?: string
          summa?: number
          telegram_id?: number
        }
        Relationships: []
      }
      bot_sessiya: {
        Row: {
          data: Json | null
          step: string | null
          telegram_id: number
          updated_at: string
        }
        Insert: {
          data?: Json | null
          step?: string | null
          telegram_id: number
          updated_at?: string
        }
        Update: {
          data?: Json | null
          step?: string | null
          telegram_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      config: {
        Row: {
          kalit: string
          qiymat: string | null
        }
        Insert: {
          kalit: string
          qiymat?: string | null
        }
        Update: {
          kalit?: string
          qiymat?: string | null
        }
        Relationships: []
      }
      davomat: {
        Row: {
          created_at: string
          erta_min: number
          holat: string | null
          id: number
          is_sinov: boolean
          izoh: string | null
          keldi: string | null
          ketdi: string | null
          lat: number | null
          lng: number | null
          masofa_m: number | null
          qaytdi: string | null
          sana: string
          sof_min: number
          telegram_id: number
          tushlikka: string | null
          updated_at: string
          video_file_id: string | null
        }
        Insert: {
          created_at?: string
          erta_min?: number
          holat?: string | null
          id?: never
          is_sinov?: boolean
          izoh?: string | null
          keldi?: string | null
          ketdi?: string | null
          lat?: number | null
          lng?: number | null
          masofa_m?: number | null
          qaytdi?: string | null
          sana: string
          sof_min?: number
          telegram_id: number
          tushlikka?: string | null
          updated_at?: string
          video_file_id?: string | null
        }
        Update: {
          created_at?: string
          erta_min?: number
          holat?: string | null
          id?: never
          is_sinov?: boolean
          izoh?: string | null
          keldi?: string | null
          ketdi?: string | null
          lat?: number | null
          lng?: number | null
          masofa_m?: number | null
          qaytdi?: string | null
          sana?: string
          sof_min?: number
          telegram_id?: number
          tushlikka?: string | null
          updated_at?: string
          video_file_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "davomat_telegram_id_fkey"
            columns: ["telegram_id"]
            isOneToOne: false
            referencedRelation: "v_oylik_soat"
            referencedColumns: ["telegram_id"]
          },
          {
            foreignKeyName: "davomat_telegram_id_fkey"
            columns: ["telegram_id"]
            isOneToOne: false
            referencedRelation: "xodimlar"
            referencedColumns: ["telegram_id"]
          },
        ]
      }
      fix_kpi: {
        Row: {
          created_at: string
          gaplashish: number
          id: number
          qongiroq: number
          sana: string
          telegram_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          gaplashish?: number
          id?: never
          qongiroq?: number
          sana: string
          telegram_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          gaplashish?: number
          id?: never
          qongiroq?: number
          sana?: string
          telegram_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      qolda_baholar: {
        Row: {
          created_at: string
          crm_foiz: number | null
          id: number
          oy: string
          sifat_ball: number | null
          telegram_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          crm_foiz?: number | null
          id?: never
          oy: string
          sifat_ball?: number | null
          telegram_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          crm_foiz?: number | null
          id?: never
          oy?: string
          sifat_ball?: number | null
          telegram_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      sinov: {
        Row: {
          arxiv: boolean
          bolim: string | null
          boshlanish: string
          bosqich: string
          created_at: string
          id: number
          imtihon_sana: string | null
          ism: string
          izoh: string | null
          kelgan_kun: number
          natija: string | null
          summa_umumiy: number
          telegram_id: number
          tugash_max: string
          updated_at: string
        }
        Insert: {
          arxiv?: boolean
          bolim?: string | null
          boshlanish: string
          bosqich?: string
          created_at?: string
          id?: never
          imtihon_sana?: string | null
          ism: string
          izoh?: string | null
          kelgan_kun?: number
          natija?: string | null
          summa_umumiy: number
          telegram_id: number
          tugash_max: string
          updated_at?: string
        }
        Update: {
          arxiv?: boolean
          bolim?: string | null
          boshlanish?: string
          bosqich?: string
          created_at?: string
          id?: never
          imtihon_sana?: string | null
          ism?: string
          izoh?: string | null
          kelgan_kun?: number
          natija?: string | null
          summa_umumiy?: number
          telegram_id?: number
          tugash_max?: string
          updated_at?: string
        }
        Relationships: []
      }
      tatil: {
        Row: {
          boshlanish: string
          created_at: string
          holat: string
          id: number
          kun_soni: number | null
          sorov_izoh: string | null
          tasdiq_by: number | null
          telegram_id: number
          tolanadi: boolean
          tugash: string
          tur: string
          updated_at: string
        }
        Insert: {
          boshlanish: string
          created_at?: string
          holat?: string
          id?: never
          kun_soni?: number | null
          sorov_izoh?: string | null
          tasdiq_by?: number | null
          telegram_id: number
          tolanadi?: boolean
          tugash: string
          tur?: string
          updated_at?: string
        }
        Update: {
          boshlanish?: string
          created_at?: string
          holat?: string
          id?: never
          kun_soni?: number | null
          sorov_izoh?: string | null
          tasdiq_by?: number | null
          telegram_id?: number
          tolanadi?: boolean
          tugash?: string
          tur?: string
          updated_at?: string
        }
        Relationships: []
      }
      xodimlar: {
        Row: {
          amocrm_id: number | null
          arxiv: boolean
          arxiv_sana: string | null
          bolim: string | null
          created_at: string
          id: number
          ish_boshi: string
          ish_tugash: string
          ism: string
          rol: string
          telefon: string | null
          telegram_id: number
          updated_at: string
        }
        Insert: {
          amocrm_id?: number | null
          arxiv?: boolean
          arxiv_sana?: string | null
          bolim?: string | null
          created_at?: string
          id?: never
          ish_boshi?: string
          ish_tugash?: string
          ism: string
          rol?: string
          telefon?: string | null
          telegram_id: number
          updated_at?: string
        }
        Update: {
          amocrm_id?: number | null
          arxiv?: boolean
          arxiv_sana?: string | null
          bolim?: string | null
          created_at?: string
          id?: never
          ish_boshi?: string
          ish_tugash?: string
          ism?: string
          rol?: string
          telefon?: string | null
          telegram_id?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_davomat_kun: {
        Row: {
          bolim: string | null
          holat: string | null
          ism: string | null
          izoh: string | null
          keldi: string | null
          ketdi: string | null
          qaytdi: string | null
          rol: string | null
          sana: string | null
          sof_min: number | null
          telegram_id: number | null
          tushlikka: string | null
        }
        Relationships: [
          {
            foreignKeyName: "davomat_telegram_id_fkey"
            columns: ["telegram_id"]
            isOneToOne: false
            referencedRelation: "v_oylik_soat"
            referencedColumns: ["telegram_id"]
          },
          {
            foreignKeyName: "davomat_telegram_id_fkey"
            columns: ["telegram_id"]
            isOneToOne: false
            referencedRelation: "xodimlar"
            referencedColumns: ["telegram_id"]
          },
        ]
      }
      v_oylik_soat: {
        Row: {
          bolim: string | null
          ism: string | null
          jami_min: number | null
          jami_soat: number | null
          kelgan_kun: number | null
          oy: string | null
          rol: string | null
          telegram_id: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      imed_sof_min: {
        Args: {
          p_keldi: string
          p_ketdi: string
          p_qaytdi: string
          p_tushlikka: string
        }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
