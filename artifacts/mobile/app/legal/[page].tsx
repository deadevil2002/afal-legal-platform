import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/Icon";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/hooks/useT";

type LegalPage =
  | "privacy-policy"
  | "terms-of-use"
  | "account-deletion-policy"
  | "data-retention-policy"
  | "contact-support";

const CONTENT: Record<LegalPage, { titleKey: string; sections: { heading: string; body: string }[] }> = {
  "privacy-policy": {
    titleKey: "privacyPolicy",
    sections: [
      {
        heading: "Introduction",
        body: "Arabian Fal Legal Services Platform (\"Arabian Fal\", \"we\", \"us\") respects your privacy and is committed to protecting the personal data you share with us. This Privacy Policy explains what data we collect, how we use it, and your rights over your information.",
      },
      {
        heading: "Data We Collect",
        body: "We collect data you provide during registration (name, employee number, department, email, phone), data generated through your use of the service (legal service requests, conversation messages, status updates, attached documents), and technical data such as device type and application version.",
      },
      {
        heading: "How We Use Your Data",
        body: "Your data is used solely to operate the Arabian Fal platform — to process your legal service requests, maintain communication between you and the legal team, and improve service quality. We do not sell or share your personal data with third parties.",
      },
      {
        heading: "Data Storage & Security",
        body: "All data is stored securely in Google Firebase (Firestore) with access controls enforced by Firestore Security Rules. File attachments are stored in Cloudinary with restricted upload presets. We apply industry-standard security practices to protect your information.",
      },
      {
        heading: "Your Rights",
        body: "You have the right to access your personal data, request corrections, and request deletion of your account and associated data. See the Account Deletion Policy for details on how to exercise these rights.",
      },
      {
        heading: "Contact Us",
        body: "If you have questions about this Privacy Policy, please contact your HR or Legal department representative, or reach out through the platform's support channel.",
      },
    ],
  },
  "terms-of-use": {
    titleKey: "termsOfUse",
    sections: [
      {
        heading: "Acceptance of Terms",
        body: "By accessing and using Arabian Fal, you agree to be bound by these Terms of Use. If you do not agree, you must not use this platform.",
      },
      {
        heading: "Authorised Users",
        body: "Arabian Fal is an internal enterprise platform. Access is limited to authorised employees of the organisation. Sharing your credentials with others is strictly prohibited.",
      },
      {
        heading: "Permitted Use",
        body: "You may use Arabian Fal only to submit legitimate legal service requests on your own behalf, to communicate with the legal team through the platform, and to review the status and progress of your requests. Any misuse, including submitting false information or attempting to access others' data, will result in account suspension.",
      },
      {
        heading: "Intellectual Property",
        body: "All content, design, and software on Arabian Fal is the exclusive property of Arabian Fal Legal Services. You may not copy, reproduce, or distribute any part of the platform without written permission.",
      },
      {
        heading: "Limitation of Liability",
        body: "Arabian Fal provides this platform on an 'as is' basis. We are not liable for any indirect, incidental, or consequential damages arising from your use of the platform.",
      },
      {
        heading: "Changes to Terms",
        body: "We may update these Terms of Use periodically. Continued use of the platform after updates constitutes acceptance of the revised terms.",
      },
    ],
  },
  "account-deletion-policy": {
    titleKey: "accountDeletionPolicy",
    sections: [
      {
        heading: "Self-Deletion",
        body: "You may delete your own account at any time from Settings → Delete My Account. This action requires your current password and is immediate and irreversible. It removes your Firestore profile, uniqueness index records, and any pending profile change requests.",
      },
      {
        heading: "Admin-Initiated Deletion",
        body: "A Super Admin may delete a user's platform data from the Admin dashboard. This removes the user's Firestore data. Note that this action does not automatically remove the Firebase Authentication record — the Super Admin must separately remove the account from Firebase Console → Authentication.",
      },
      {
        heading: "Data Removed on Deletion",
        body: "Deleting an account removes: your user profile document, your phone and employee number uniqueness index records, and any pending profile change requests associated with your account. Submitted legal service requests and conversation threads are retained for audit and legal purposes.",
      },
      {
        heading: "Retention of Request History",
        body: "Legal service requests and their associated conversation threads are part of the organisation's legal record. These are not deleted when your account is removed and are retained in accordance with our Data Retention Policy.",
      },
      {
        heading: "Irreversibility",
        body: "Account deletion is permanent. Once deleted, your account cannot be restored. You will need to register a new account to use the platform again, subject to administrator approval.",
      },
    ],
  },
  "data-retention-policy": {
    titleKey: "dataRetentionPolicy",
    sections: [
      {
        heading: "Retention Periods",
        body: "Active account data (profile, preferences) is retained for the duration of your employment and up to 12 months after account deletion. Legal service request records and conversation threads are retained for a minimum of 7 years for legal and compliance purposes.",
      },
      {
        heading: "File Attachments",
        body: "Files uploaded as attachments to legal requests are stored in Cloudinary and are retained for the same period as the associated request records. Deletion of your account does not remove files already submitted as part of a legal request.",
      },
      {
        heading: "Audit Logs",
        body: "Administrative actions (role changes, account deletions, status updates) are logged and retained for security and accountability purposes for a minimum of 3 years.",
      },
      {
        heading: "Data Deletion Requests",
        body: "If you wish to request deletion of data beyond the scope of the self-deletion feature (e.g. removal of request history), please contact your HR or Legal department representative. Such requests are subject to applicable legal and regulatory requirements.",
      },
      {
        heading: "Legal Compliance",
        body: "Our data retention practices comply with applicable data protection laws and the internal data governance policies of the organisation.",
      },
    ],
  },
  "contact-support": {
    titleKey: "contactSupport",
    sections: [
      {
        heading: "Platform Support",
        body: "For technical issues with the Arabian Fal platform — such as login problems, app errors, or difficulties submitting requests — please contact your IT department or system administrator.",
      },
      {
        heading: "Legal Service Inquiries",
        body: "For questions about your legal service requests, case status, or to follow up on a matter, please use the messaging thread within your request directly from the platform. The legal team monitors and responds to all in-platform messages.",
      },
      {
        heading: "Profile & Account Issues",
        body: "If you cannot update your profile details through the platform (e.g. employee number or phone number changes), submit a Profile Change Request from the Settings screen. An admin will review and process it.",
      },
      {
        heading: "Data & Privacy Inquiries",
        body: "For questions about your personal data, deletion requests, or privacy concerns, contact your HR department or Data Protection Officer (DPO) if one has been appointed by your organisation.",
      },
      {
        heading: "Feedback & Suggestions",
        body: "We value your feedback to improve Arabian Fal. Please share suggestions with your department administrator or through your internal feedback channels.",
      },
    ],
  },
};

export default function LegalPage() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const router = useRouter();
  const colors = useColors();
  const { t, isRTL } = useT();
  const insets = useSafeAreaInsets();

  const key = (page ?? "privacy-policy") as LegalPage;
  const content = CONTENT[key] ?? CONTENT["privacy-policy"];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: "#112B4D",
            paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name={isRTL ? "chevron-right" : "chevron-left"} size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, isRTL && styles.textRTL]}>
          {t(content.titleKey as Parameters<typeof t>[0])}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {content.sections.map((section, idx) => (
          <View key={idx} style={[styles.section, { borderBottomColor: colors.border }]}>
            <Text style={[styles.sectionHeading, { color: colors.primary }, isRTL && styles.textRTL]}>
              {section.heading}
            </Text>
            <Text style={[styles.sectionBody, { color: colors.foreground }, isRTL && styles.textRTL]}>
              {section.body}
            </Text>
          </View>
        ))}

        <Text style={[styles.lastUpdated, { color: colors.mutedForeground }]}>
          Last updated: April 2026
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  section: {
    marginBottom: 24,
    paddingBottom: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionHeading: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  sectionBody: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  textRTL: {
    textAlign: "right",
  },
  lastUpdated: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 8,
  },
});
