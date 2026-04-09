import React from "react";
import { Image, StyleSheet, View } from "react-native";

interface LogoProps {
  size?: "small" | "medium" | "large";
  variant?: "full" | "icon";
}

const SIZES = {
  small: { width: 80, height: 40 },
  medium: { width: 160, height: 80 },
  large: { width: 220, height: 110 },
};

export function Logo({ size = "medium", variant = "full" }: LogoProps) {
  const dims = SIZES[size];
  return (
    <View style={styles.container}>
      <Image
        source={require("@/assets/images/fal-logo.jpg")}
        style={[
          styles.logo,
          { width: dims.width, height: dims.height },
          variant === "icon" && { width: dims.height, height: dims.height },
        ]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    backgroundColor: "transparent",
  },
});
