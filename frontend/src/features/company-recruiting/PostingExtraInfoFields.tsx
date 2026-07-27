import {
  postingExtraInfoFields,
  type PostingExtraInfo,
  type PostingExtraInfoKey,
} from "./posting-extra-info";

type PostingExtraInfoFieldsProps = {
  value: PostingExtraInfo;
  disabled?: boolean;
  onChange: (value: PostingExtraInfo) => void;
};

export function PostingExtraInfoFields({ value, disabled = false, onChange }: PostingExtraInfoFieldsProps) {
  function updateField(key: PostingExtraInfoKey, patch: Partial<PostingExtraInfo[PostingExtraInfoKey]>) {
    onChange({
      ...value,
      [key]: {
        ...value[key],
        ...patch,
      },
    });
  }

  return (
    <div className="posting-extra-fields">
      {postingExtraInfoFields.map((field) => {
        const state = value[field.key];
        const customValue = state.enabled && state.value && !field.options.includes(state.value) ? state.value : "";

        return (
          <div className={`posting-extra-field ${state.enabled ? "is-enabled" : ""}`} key={field.key}>
            <div className="posting-extra-field-head">
              <span>{field.label}</span>
              <button
                className="posting-extra-clear"
                type="button"
                disabled={disabled || !state.enabled}
                onClick={() => updateField(field.key, { enabled: false, value: "" })}
              >
                입력 안 함
              </button>
            </div>
            <div className="posting-extra-options" role="radiogroup" aria-label={`${field.label} 선택`}>
              {field.options.map((option) => (
                <label className="posting-extra-option" key={option}>
                  <input
                    type="radio"
                    name={`posting-extra-${field.key}`}
                    checked={state.enabled && state.value === option}
                    disabled={disabled}
                    onChange={() => updateField(field.key, { enabled: true, value: option })}
                  />
                  <span>{option}</span>
                </label>
              ))}
              <label className="posting-extra-option">
                <input
                  type="radio"
                  name={`posting-extra-${field.key}`}
                  checked={Boolean(customValue)}
                  disabled={disabled}
                  onChange={() => updateField(field.key, { enabled: true, value: customValue || "" })}
                />
                <span>직접 입력</span>
              </label>
            </div>
            {customValue || (state.enabled && !state.value) ? (
              <input
                aria-label={`${field.label} 직접 입력`}
                disabled={disabled}
                value={customValue || state.value}
                onChange={(event) => updateField(field.key, { enabled: true, value: event.target.value })}
                placeholder={field.placeholder}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

type PostingExtraInfoSummaryProps = {
  value: PostingExtraInfo;
};

export function PostingExtraInfoSummary({ value }: PostingExtraInfoSummaryProps) {
  const items = postingExtraInfoFields
    .map((field) => ({
      ...field,
      value: value[field.key].enabled ? value[field.key].value.trim() : "",
    }))
    .filter((field) => field.value);

  if (items.length === 0) {
    return null;
  }

  return (
    <dl className="posting-extra-summary">
      {items.map((item) => (
        <div className="posting-extra-summary-item" key={item.key}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
