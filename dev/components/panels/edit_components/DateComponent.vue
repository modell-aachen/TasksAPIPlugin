<template>
    <div>
      <div class="input-group date-picker">
        <span class="input-group-label"><i class="fa fa-calendar calendersymbol" aria-hidden="true"></i></span>
        <input type="text" class="input-group-field" ref="datepicker" v-bind:placeholder="placeholder">
      </div>
    </div>
</template>

<script>
/* global $ */
import MetaFieldMixin from '../../../mixins/MetaFieldMixin.vue';
export default {
    mixins: [MetaFieldMixin],
    props: ["placeholder"],
    mounted: function () {
        let self = this;
        let $datepicker = $(this.$refs.datepicker).pickadate({
            format: 'dd.mm.yyyy',
            selectYears: true,
            selectMonths: true,
            onSet: function(thingSet) {
                self.fields[self.fieldName].value = Math.floor(thingSet.select/1000);
            }
        }).pickadate('picker');
        if(self.fields[self.fieldName].value)
            $datepicker.set('select', Math.floor(self.fields[self.fieldName].value*1000));
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

</style>
