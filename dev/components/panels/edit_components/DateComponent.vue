<template>
    <div>
      <div class="input-group date-picker">
        <span class="input-group-label"><i class="fa fa-calendar calendersymbol" aria-hidden="true"></i></span>
        <input type="text" class="input-group-field" ref="datepicker" v-bind:placeholder="placeholder">
      </div>
      <div class="outside-overlay" v-if="isPickerOpen" @click="closePicker">
      </div>
    </div>
</template>

<script>
/* global $ */
import MetaFieldMixin from '../../../mixins/MetaFieldMixin.vue';
export default {
    mixins: [MetaFieldMixin],
    data: function() {
        return {isPickerOpen: false,
                datepicker: null};
    },
    props: ["placeholder"],
    mounted: function () {
        let self = this;
        let $datepicker = $(this.$refs.datepicker).pickadate({
            format: 'dd.mm.yyyy',
            selectYears: true,
            selectMonths: true,
            onSet: function(thingSet) {
                self.fields[self.fieldName].value = Math.floor(thingSet.select/1000);
            },
            onOpen: function() {
                self.isPickerOpen = true;
            },
            onClose: function() {
                self.isPickerOpen = false;
            }
        }).pickadate('picker');
        if(self.fields[self.fieldName].value)
            $datepicker.set('select', Math.floor(self.fields[self.fieldName].value*1000));
        this.datepicker = $datepicker;

    },
    methods: {
        closePicker: function() {
            this.datepicker.close();
        }
    }
};
</script>

<style lang="sass">
    .date-picker {
        position: relative;
        input[readonly]{
            cursor: pointer;
        }
        .picker {
            left: 0;
        }
        .picker__header {
            .picker__select--year,.picker__select--month {
                width: 40%;
                margin: 0 5px;
            }
        }
        .picker--opened .picker__holder {
            height: 30em;
            max-height: 30em;
        }
    }
    .outside-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
    }
</style>
