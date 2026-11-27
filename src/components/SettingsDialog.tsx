import { useEffect, useState } from 'react'
import { getAlorRefreshToken, setAlorRefreshToken } from '@/api/alor-client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface SettingsDialogProps {
  /** Открыта ли модалка */
  open: boolean
  /** Смена open */
  onOpenChange: (open: boolean) => void
}

/**
 * Настройки приложения: Alor refresh token.
 */
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [tokenDraft, setTokenDraft] = useState(() => getAlorRefreshToken() ?? '')

  useEffect(() => {
    if (open) {
      setTokenDraft(getAlorRefreshToken() ?? '')
    }
  }, [open])

  const handleSave = () => {
    setAlorRefreshToken(tokenDraft)
    onOpenChange(false)
  }

  const handleClear = () => {
    setTokenDraft('')
    setAlorRefreshToken(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Настройки</DialogTitle>
          <DialogDescription>Токен Alor для загрузки свечей на графике.</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-alor-token">Alor refresh token</Label>
            <Input
              id="settings-alor-token"
              type="password"
              autoComplete="off"
              placeholder="Вставьте refresh token"
              value={tokenDraft}
              onChange={(event) => setTokenDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleSave()
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Сохраняется в <code className="text-foreground">localStorage.token</code>. Refresh через
              oauth.alor.ru.
            </p>
          </div>
        </DialogBody>
        <DialogFooter className="px-5 pb-5">
          <Button type="button" variant="secondary" onClick={handleClear}>
            Очистить
          </Button>
          <Button type="button" onClick={handleSave}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
