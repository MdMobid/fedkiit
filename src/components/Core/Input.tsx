"use client";

import {
  forwardRef,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type MouseEvent,
  type MouseEventHandler,
} from "react";
import { FaRegCalendarAlt } from "react-icons/fa";
import Select, {
  components,
  type DropdownIndicatorProps,
  type StylesConfig,
} from "react-select";
import DatePicker, { type DatePickerProps } from "react-date-picker";
import { AiOutlineDown } from "react-icons/ai";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import DatePickerWithTime from "react-datepicker";
import styles from "./styles/Core.module.scss";

type CustomInputProps = {
  value?: string;
  onClick?: MouseEventHandler<HTMLDivElement>;
  placeholder?: string;
};

const CustomInput = forwardRef<HTMLDivElement, CustomInputProps>(
  ({ value, onClick, placeholder = "Select Date & Time" }, ref) => (
    <div
      onClick={onClick}
      ref={ref}
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <p
        style={{
          margin: "4px",
          fontSize: "12px !important",
          opacity: value ? 1 : 0.5,
          fontWeight: "100 !important",
        }}
      >
        {value || placeholder}
      </p>
      <FaRegCalendarAlt
        color="#fff"
        size={18}
        style={{
          position: "absolute",
          top: "20%",
          right: "8px",
        }}
      />
    </div>
  )
);

CustomInput.displayName = "CustomInput";

export type SelectOption = {
  value: string;
  label: string;
};

type ChangeFor<T extends string> = T extends "select"
  ? SelectOption["value"]
  : T extends "date"
  ? Parameters<NonNullable<DatePickerProps["onChange"]>>[0]
  : T extends "datetime-local"
  ? Date | null
  : T extends "file" | "image"
  ? { target: { value: File } }
  : ChangeEvent<HTMLInputElement & HTMLTextAreaElement>;

/**
 * What `onChange` receives for each `type`. When the type is only known at
 * runtime (a plain `string`), it can be any of them.
 */
export type InputChange<T extends string> = string extends T
  ? ChangeFor<"select" | "date" | "datetime-local" | "file" | "text">
  : ChangeFor<T>;

export type InputValue = string | number | Date | null | undefined;

export type InputProps<T extends string = "text"> = {
  type?: T;
  containerStyle?: CSSProperties;
  style?: CSSProperties;
  placeholder?: string;
  value?: InputValue;
  onChange: (change: InputChange<T>) => void;
  label?: string;
  options?: SelectOption[];
  name?: string;
  showLabel?: boolean;
  className?: string;
  containerClassName?: string;
  id?: string;
  maxLength?: number;
  max?: number | string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  // Anything else is forwarded untouched to the underlying control.
  [key: string]: unknown;
};

const getCustomStyles = (
  style?: CSSProperties
): StylesConfig<SelectOption, false> => ({
  container: (provided) => ({
    ...provided,
    width: style?.width !== undefined ? (style.width as string) : "100%",
    border: "none",
    background: "transparent",
    padding: 0,
  }),
  control: (provided, state) => ({
    ...provided,
    display: "flex",
    alignItems: "center",
    outline: "none",
    width: "100%",
    fontSize: (style?.fontSize as string) || "12px",
    backgroundColor: (style?.backgroundColor as string) || "transparent",
    borderRadius: (style?.borderRadius as string) || "4px",
    color: "#fff",
    height: (style?.height as string) || "40px",
    minHeight: (style?.height as string) || "40px",
    margin: style?.margin !== undefined ? (style.margin as string) : "6px",
    marginBottom:
      style?.marginBottom !== undefined
        ? (style.marginBottom as string)
        : style?.margin !== undefined
          ? (style.margin as string)
          : "10px",
    position: "relative",
    border: state.isFocused
      ? "1px solid #fff !important"
      : (style?.border as string) ||
      "1px solid rgba(211, 211, 211, 0.5) !important",
    boxShadow: "none",
    boxSizing: "border-box",
    "&:hover": {
      borderColor: "#fff !important",
      transition: "0.3s ease-in-out",
    },
    "@media (max-width: 768px)": {
      fontSize: "16px !important",
      minHeight: style?.height ? (style.height as string) : "44px",
      height: style?.height ? (style.height as string) : "44px",
      margin:
        style?.margin !== undefined
          ? (style.margin as string)
          : "0px 0px 10px 0px",
      marginBottom:
        style?.marginBottom !== undefined
          ? (style.marginBottom as string)
          : "10px",
    },
  }),
  valueContainer: (provided) => ({
    ...provided,
    padding: "0 10px",
    height: "100%",
    minHeight: "38px",
    display: "flex",
    alignItems: "center",
  }),
  placeholder: (provided) => ({
    ...provided,
    color: "rgba(255, 255, 255, 0.5)",
    margin: 0,
    fontSize: (style?.fontSize as string) || "12px",
    "@media (max-width: 768px)": {
      fontSize: "16px !important",
    },
  }),
  singleValue: (provided) => ({
    ...provided,
    color: "#fff",
    margin: 0,
    fontSize: (style?.fontSize as string) || "12px",
    display: "flex",
    alignItems: "center",
    "@media (max-width: 768px)": {
      fontSize: "16px !important",
    },
  }),
  input: (provided) => ({
    ...provided,
    margin: 0,
    padding: 0,
    color: "#fff",
  }),
  indicatorsContainer: (provided) => ({
    ...provided,
    height: "100%",
    minHeight: "38px",
  }),
  menu: (provided) => ({
    ...provided,
    backgroundColor: "#18181b",
    border: "1px solid rgba(255, 255, 255, 0.15)",
    borderRadius: (style?.borderRadius as string) || "8px",
    boxShadow: "0 12px 36px rgba(0, 0, 0, 0.7)",
    zIndex: 9999,
    marginLeft:
      style?.margin !== undefined
        ? style.margin === "0px" || style.margin === 0 || style.margin === "0"
          ? "0px"
          : (style.margin as string)
        : "6px",
    width:
      style?.margin !== undefined &&
        (style.margin === "0px" || style.margin === "0" || style.margin === 0)
        ? "100%"
        : "calc(100% - 12px)",
    "@media (max-width: 768px)": {
      marginLeft:
        style?.margin !== undefined &&
          style.margin !== "0px" &&
          style.margin !== 0
          ? (style.margin as string)
          : "0px",
      width:
        style?.margin !== undefined &&
          style.margin !== "0px" &&
          style.margin !== 0
          ? "calc(100% - 12px)"
          : "100%",
    },
  }),
  menuPortal: (provided) => ({ ...provided, zIndex: 9999 }),
  option: (provided, state) => ({
    ...provided,
    color: state.isSelected ? "#FF8A00" : "#fff",
    backgroundColor: state.isSelected
      ? "rgba(255, 138, 0, 0.15)"
      : state.isFocused
        ? "rgba(255, 255, 255, 0.08)"
        : "transparent",
    cursor: "pointer",
    fontSize: (style?.fontSize as string) || "14px",
    borderRadius: "6px",
    margin: "2px 4px",
    width: "auto",
    "&:hover": {
      backgroundColor: "rgba(255, 138, 0, 0.2)",
      color: "#FF8A00",
      transition: "ease-in-out 0.2s",
    },
    "&:active": {
      backgroundColor: "rgba(255, 138, 0, 0.3)",
      color: "#FF8A00",
    },
  }),
  indicatorSeparator: () => ({
    display: "none",
  }),
});

const DropdownIndicator = (props: DropdownIndicatorProps<SelectOption, false>) => {
  return (
    <components.DropdownIndicator {...props}>
      <AiOutlineDown
        color="#fff"
        size={18}
        style={{
          position: "absolute",
          right: "12px",
          top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "none",
        }}
      />
    </components.DropdownIndicator>
  );
};

function Input<T extends string = "text">(props: InputProps<T>) {
  const {
    type = "text",
    containerStyle,
    style,
    placeholder,
    value,
    onChange,
    label,
    options,
    name,
    showLabel = true,
    // Defaults to "" because it is interpolated into a template literal below.
    // Without it, every caller that omits the prop rendered a literal
    // "undefined" in the class list.
    className = "",
    containerClassName = "",
    ...rest
  } = props;
  // The public signature narrows the argument per `type`; each branch below
  // hands over exactly what its `type` produces, so it is called untyped here.
  const emitChange = onChange as (change: unknown) => void;
  const dateRef = useRef(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const [showPassword, setshowPassword] = useState(false);
  const [previewFile, setpreviewFile] = useState<string | null>(null);

  // When callers pass only `onChange` (no `value`), keep the field uncontrolled.
  // Defaulting `value` to "" used to force every input controlled at "" — typing
  // never appeared because React kept resetting the DOM value.
  const isControlled = Object.prototype.hasOwnProperty.call(props, "value");
  const controlledValue = isControlled ? (value ?? "") : undefined;
  // A controlled text-like field only ever holds a string or number.
  const valueProps = isControlled
    ? { value: controlledValue as string | number }
    : {};

  const filterPassedTime = (time: Date) => {
    const currentDate = new Date();
    const selectedDate = new Date(time);

    return currentDate.getTime() < selectedDate.getTime();
  };

  const getInputTypes = () => {
    switch (type) {
      case "text":
        return (
          <input
            name={name}
            className={`${styles.input} ${className}`}
            type={type}
            style={style || {}}
            placeholder={placeholder}
            {...valueProps}
            onChange={emitChange}
            {...rest}
          />
        );

      case "number":
        return (
          <input
            name={name}
            className={`${styles.input} ${className}`}
            type={type}
            style={style || {}}
            placeholder={placeholder}
            {...valueProps}
            onChange={emitChange}
            {...rest}
          />
        );

      case "textArea":
        return (
          <textarea
            name={name}
            className={`${styles.input} ${styles.inputTxtArea} ${className}`}
            style={style || {}}
            placeholder={placeholder}
            {...valueProps}
            onChange={emitChange}
            {...rest}
          />
        );

      case "select":
        return (
          <Select
            name={name}
            placeholder={placeholder}
            value={
              isControlled
                ? options!.find((option) => option.value === value) || null
                : undefined
            }
            options={options}
            onChange={(selectedOption) => emitChange(selectedOption!.value)}
            styles={getCustomStyles(style)}
            components={{ DropdownIndicator }}
            isSearchable={false}
            className={className}
            // react-select only distinguishes "fixed"; the "auto" this
            // passed before was handled exactly like the "absolute" default.
            menuPosition="absolute"
            {...rest}
          />
        );

      case "date":
        // react-date-picker ignores ref, placeholder and style (only its own
        // props and event handlers are read), so none are passed to it.
        return (
          <div>
            <DatePicker
              name={name}
              className={`${styles.input} ${styles.inputDate} ${className}`}
              value={value as DatePickerProps["value"]}
              onChange={emitChange}
              clearIcon={null}
              calendarIcon={
                <FaRegCalendarAlt
                  color="#fff"
                  size={18}
                  style={{
                    position: "absolute",
                    top: "25%",
                    right: "12px",
                  }}
                />
              }
              {...rest}
            />
          </div>
        );
      case "datetime-local":
        return (
          <div className={`${styles.input} ${styles.inputDate} ${className}`}>
            <DatePickerWithTime
              name={name}
              ref={dateRef}
              value={value as string | undefined}
              onChange={emitChange}
              // react-datepicker has no clearIcon prop (that is
              // react-date-picker's), so it is not passed here.
              showTimeSelect
              filterTime={filterPassedTime}
              timeFormat="HH:mm"
              timeIntervals={15}
              timeCaption="time"
              dateFormat="MMMM d, yyyy h:mm"
              customInput={<CustomInput placeholder={placeholder} />}
              {...rest}
            />
          </div>
        );
      case "radio":
        return (
          <div className={styles.checkboxWrapper}>
            <input
              name={name}
              className={styles.checkboxInput}
              type="radio"
              placeholder={placeholder}
              value={value as string | number | undefined}
              onChange={emitChange}
              id={rest.id || `${name}-${value}`}
              {...rest}
            />
            <label
              className={styles.checkboxLabel}
              htmlFor={rest.id || `${name}-${value}`}
            >
              {label}
            </label>
          </div>
        );
      case "checkbox":
        return (
          <div className={styles.checkboxWrapper}>
            <input
              name={name}
              className={styles.checkboxInput}
              type="checkbox"
              placeholder={placeholder}
              value={value as string | number | undefined}
              onChange={emitChange}
              id={rest.id || `${name}-${value}`}
              {...rest}
            />
            <label
              className={styles.checkboxLabel}
              htmlFor={rest.id || `${name}-${value}`}
            >
              {label}
            </label>
          </div>
        );

      case "password":
        return (
          <div>
            <div
              style={{
                position: "relative",
              }}
            >
              <input
                name={name}
                maxLength={rest.maxLength || 20}
                max={rest.max || 20}
                className={`${styles.input}${className ? ` ${className}` : ""}`}
                type={showPassword ? "text" : "password"}
                style={style || {}}
                placeholder={placeholder}
                {...valueProps}
                onChange={emitChange}
                {...rest}
              />
              {showPassword ? (
                <FaEyeSlash
                  onClick={() => setshowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "16px",
                    top: "25%",
                    cursor: "pointer",
                  }}
                  color="#fff"
                  size={18}
                />
              ) : (
                <FaEye
                  onClick={() => setshowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: "16px",
                    top: "25%",
                    cursor: "pointer",
                  }}
                  color="#fff"
                  size={18}
                />
              )}
            </div>
          </div>
        );
      case "file":
        return (
          <div
            className={styles.input}
            onClick={() => fileRef.current?.click()}
            style={{
              height: "40px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              userSelect: "none",
            }}
          >
            <input
              ref={fileRef}
              name={name}
              type={type}
              style={{
                display: "none",
              }}
              placeholder={placeholder}
              onChange={() => {
                const e = {
                  target: {
                    value: fileRef.current!.files![0],
                  },
                };
                setpreviewFile(URL.createObjectURL(fileRef.current!.files![0]));
                emitChange(e);
              }}
              {...rest}
            />
            {previewFile && (
              <img
                src={previewFile}
                style={{
                  height: "24px",
                  width: "24px",
                  borderRadius: "8px",
                  marginRight: "8px",
                }}
              />
            )}
            <span
              style={{
                color: "#fff",
                opacity: value ? 1 : 0.5,
                width: "100%",
                overflow: "hidden",
              }}
            >
              {(value as string | undefined) || "No file selected"}
            </span>
          </div>
        );
      case "image":
        return (
          <div
            className={styles.input}
            onClick={() => {
              imgRef.current?.click();
            }}
            style={{
              height: "40px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              userSelect: "none",
            }}
          >
            <input
              ref={imgRef}
              name={name}
              type={"file"}
              accept="image/png, image/jpeg, image/jpg"
              style={{
                display: "none",
              }}
              placeholder={placeholder}
              onChange={() => {
                const e = {
                  target: {
                    value: imgRef.current!.files![0],
                  },
                };
                setpreviewFile(URL.createObjectURL(imgRef.current!.files![0]));
                emitChange(e);
              }}
              {...rest}
            />
            {previewFile && (
              <img
                src={previewFile}
                style={{
                  height: "24px",
                  width: "24px",
                  borderRadius: "8px",
                  marginRight: "8px",
                }}
              />
            )}
            <span
              style={{
                color: "#fff",
                opacity: value ? 1 : 0.5,
                width: "100%",
                overflow: "hidden",
              }}
            >
              {(value as string | undefined) || "No images selected"}
            </span>
          </div>
        );
      default:
        return (
          <input
            name={name}
            className={`${styles.input}${className ? ` ${className}` : ""}`}
            type={type}
            style={style || {}}
            placeholder={placeholder}
            {...valueProps}
            onChange={emitChange}
            {...rest}
          />
        );
    }
  };

  return (
    <div
      className={`${styles.containerInput} ${containerClassName}`}
      style={
        containerStyle || {
          marginTop: "8px",
        }
      }
    >
      {showLabel && label && (
        <label
          style={{
            color: "#fff",
            marginBottom: "4px",
            fontSize: ".8em",
            marginLeft:
              style?.margin !== undefined &&
              (style.margin === "0px" || style.margin === "0" || style.margin === 0)
                ? "0px"
                : "6px",
          }}
          htmlFor={label}
        >
          {label}
        </label>
      )}
      {getInputTypes()}
    </div>
  );
}

export default Input;
