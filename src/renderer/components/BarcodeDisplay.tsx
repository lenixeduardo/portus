import React, { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface Props {
  value: string;
  height?: number;
  displayValue?: boolean;
  lineColor?: string;
}

export function BarcodeDisplay({ value, height = 44, displayValue = false, lineColor = "#e8e8f0" }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: "CODE128",
        height,
        displayValue,
        background: "transparent",
        lineColor,
        margin: 0,
        fontSize: 10,
      });
    } catch {
      // Invalid value — leave SVG empty.
    }
  }, [value, height, displayValue, lineColor]);

  return <svg ref={svgRef} style={{ width: "100%", maxWidth: 200 }} />;
}
